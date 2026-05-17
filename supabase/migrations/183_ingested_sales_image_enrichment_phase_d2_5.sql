-- Phase D2.5: YSTM detail-page image enrichment (mediaStr) for cron-ingested rows.

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS image_enrichment_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_image_enrichment_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS image_enrichment_failure_reason text NULL;

COMMENT ON COLUMN lootaura_v2.ingested_sales.image_enrichment_attempts IS
  'D2.5: bounded attempts to fetch detail HTML and parse mediaStr for images.';
COMMENT ON COLUMN lootaura_v2.ingested_sales.last_image_enrichment_attempt_at IS
  'D2.5: last image enrichment worker attempt timestamp.';
COMMENT ON COLUMN lootaura_v2.ingested_sales.image_enrichment_failure_reason IS
  'D2.5: last image enrichment failure reason (no raw URLs).';

CREATE INDEX IF NOT EXISTS idx_ingested_sales_image_enrichment_claim
  ON lootaura_v2.ingested_sales (last_image_enrichment_attempt_at ASC NULLS FIRST)
  WHERE address_status = 'address_available'
    AND (image_source_url IS NULL OR btrim(image_source_url) = '')
    AND image_enrichment_attempts < 5;

DROP FUNCTION IF EXISTS lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer);

CREATE FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(
  p_batch_size integer DEFAULT 25,
  p_cooldown_minutes integer DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  source_platform text,
  canonical_source_url text,
  source_url text,
  city text,
  state text,
  image_enrichment_attempts integer,
  image_source_url text,
  failure_reasons jsonb,
  failure_details jsonb,
  raw_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      s.id,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_platform, COALESCE(s.canonical_source_url, s.source_url)
        ORDER BY s.created_at ASC, s.id ASC
      ) AS rn
    FROM lootaura_v2.ingested_sales s
    WHERE s.address_status = 'address_available'
      AND (s.image_source_url IS NULL OR btrim(s.image_source_url) = '')
      AND s.image_enrichment_attempts < 5
      AND s.source_url ~* 'yardsaletreasuremap\.(com|net|org)/.*/(listing|userlisting)\.html'
      AND (
        s.last_image_enrichment_attempt_at IS NULL
        OR s.last_image_enrichment_attempt_at < now() - make_interval(mins => p_cooldown_minutes)
      )
  ),
  candidates AS (
    SELECT r.id
    FROM ranked r
    WHERE r.rn = 1
    ORDER BY r.id
    LIMIT GREATEST(COALESCE(p_batch_size, 25), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE lootaura_v2.ingested_sales s
    SET
      image_enrichment_attempts = s.image_enrichment_attempts + 1,
      last_image_enrichment_attempt_at = now()
    FROM candidates c
    WHERE s.id = c.id
    RETURNING
      s.id,
      s.source_platform,
      s.canonical_source_url,
      s.source_url,
      s.city,
      s.state,
      s.image_enrichment_attempts,
      s.image_source_url,
      s.failure_reasons,
      s.failure_details,
      s.raw_payload
  )
  SELECT
    claimed.id,
    claimed.source_platform,
    claimed.canonical_source_url,
    claimed.source_url,
    claimed.city,
    claimed.state,
    claimed.image_enrichment_attempts,
    claimed.image_source_url,
    claimed.failure_reasons,
    claimed.failure_details,
    claimed.raw_payload
  FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) FROM authenticated;

-- Address enrichment claim: return image_source_url for D2.5 reuse on same detail fetch.
DROP FUNCTION IF EXISTS lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer);

CREATE FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(
  p_batch_size integer DEFAULT 25,
  p_cooldown_minutes integer DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  source_platform text,
  canonical_source_url text,
  source_url text,
  city text,
  state text,
  address_enrichment_attempts integer,
  address_unlock_at timestamptz,
  image_source_url text,
  failure_reasons jsonb,
  failure_details jsonb,
  raw_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      s.id,
      ROW_NUMBER() OVER (
        PARTITION BY s.source_platform, COALESCE(s.canonical_source_url, s.source_url)
        ORDER BY s.created_at ASC, s.id ASC
      ) AS rn
    FROM lootaura_v2.ingested_sales s
    WHERE s.address_status IN (
        'address_gated',
        'address_enrichment_pending',
        'address_enrichment_retry'
      )
      AND s.address_enrichment_attempts < 5
      AND (
        s.next_enrichment_attempt_at IS NULL
        OR s.next_enrichment_attempt_at <= now()
      )
      AND (
        s.address_unlock_at IS NULL
        OR s.address_unlock_at <= now()
      )
      AND (
        s.last_address_enrichment_attempt_at IS NULL
        OR s.last_address_enrichment_attempt_at < now() - make_interval(mins => p_cooldown_minutes)
      )
  ),
  candidates AS (
    SELECT r.id
    FROM ranked r
    WHERE r.rn = 1
    ORDER BY r.id
    LIMIT GREATEST(COALESCE(p_batch_size, 25), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE lootaura_v2.ingested_sales s
    SET
      address_enrichment_attempts = s.address_enrichment_attempts + 1,
      last_address_enrichment_attempt_at = now(),
      address_status = 'address_enrichment_pending'
    FROM candidates c
    WHERE s.id = c.id
    RETURNING
      s.id,
      s.source_platform,
      s.canonical_source_url,
      s.source_url,
      s.city,
      s.state,
      s.address_enrichment_attempts,
      s.address_unlock_at,
      s.image_source_url,
      s.failure_reasons,
      s.failure_details,
      s.raw_payload
  )
  SELECT
    claimed.id,
    claimed.source_platform,
    claimed.canonical_source_url,
    claimed.source_url,
    claimed.city,
    claimed.state,
    claimed.address_enrichment_attempts,
    claimed.address_unlock_at,
    claimed.image_source_url,
    claimed.failure_reasons,
    claimed.failure_details,
    claimed.raw_payload
  FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) FROM authenticated;

COMMIT;
