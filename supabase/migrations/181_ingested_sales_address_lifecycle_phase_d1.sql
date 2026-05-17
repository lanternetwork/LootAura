-- Phase D1: address lifecycle separate from geocode/publish status.
-- Gated YSTM listings enrich address on detail page before entering needs_geocode.

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS address_status text NOT NULL DEFAULT 'address_available',
  ADD COLUMN IF NOT EXISTS canonical_source_url text NULL,
  ADD COLUMN IF NOT EXISTS address_unlock_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS address_enrichment_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_address_enrichment_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS next_enrichment_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS address_enrichment_failure_reason text NULL;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_address_status_check;

ALTER TABLE lootaura_v2.ingested_sales
  ADD CONSTRAINT ingested_sales_address_status_check
  CHECK (
    address_status IN (
      'address_available',
      'address_gated',
      'address_enrichment_pending',
      'address_enrichment_retry',
      'address_unavailable_terminal'
    )
  );

COMMENT ON COLUMN lootaura_v2.ingested_sales.address_status IS
  'Address lifecycle (D1): separate from geocode/publish status; only address_available rows enter needs_geocode.';
COMMENT ON COLUMN lootaura_v2.ingested_sales.canonical_source_url IS
  'Normalized listing URL for enrichment dedupe (platform + canonical URL).';
COMMENT ON COLUMN lootaura_v2.ingested_sales.address_unlock_at IS
  'Parsed See-source-for-address-after-* unlock time (UTC).';
COMMENT ON COLUMN lootaura_v2.ingested_sales.next_enrichment_attempt_at IS
  'Do not claim for detail enrichment before this instant (honors unlock + backoff).';

-- Backfill canonical URLs from source_url (hash preserved; query order normalized in app).
UPDATE lootaura_v2.ingested_sales s
SET canonical_source_url = s.source_url
WHERE s.canonical_source_url IS NULL AND s.source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingested_sales_address_enrichment_claim
  ON lootaura_v2.ingested_sales (address_status, next_enrichment_attempt_at ASC NULLS FIRST, created_at ASC)
  WHERE address_status IN (
    'address_gated',
    'address_enrichment_pending',
    'address_enrichment_retry'
  );

CREATE INDEX IF NOT EXISTS idx_ingested_sales_address_status_metrics
  ON lootaura_v2.ingested_sales (address_status);

CREATE INDEX IF NOT EXISTS idx_ingested_sales_canonical_enrichment_dedupe
  ON lootaura_v2.ingested_sales (source_platform, canonical_source_url)
  WHERE address_status IN (
    'address_gated',
    'address_enrichment_pending',
    'address_enrichment_retry'
  );

-- Geocode claim: only rows with address_available and non-empty address_raw.
DROP FUNCTION IF EXISTS lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer);

CREATE FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(
  p_batch_size integer DEFAULT 100,
  p_cooldown_minutes integer DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  normalized_address text,
  address_raw text,
  city text,
  state text,
  geocode_attempts integer,
  failure_reasons jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT s.id
    FROM lootaura_v2.ingested_sales s
    WHERE s.status = 'needs_geocode'
      AND s.address_status = 'address_available'
      AND s.address_raw IS NOT NULL
      AND btrim(s.address_raw) <> ''
      AND s.geocode_attempts < 3
      AND (
        s.last_geocode_attempt_at IS NULL
        OR s.last_geocode_attempt_at < now() - make_interval(mins => p_cooldown_minutes)
      )
    ORDER BY
      CASE WHEN s.geocode_attempts = 0 THEN 0 ELSE 1 END ASC,
      COALESCE(s.last_geocode_attempt_at, to_timestamp(0)) ASC,
      s.updated_at ASC,
      s.created_at ASC,
      s.id ASC
    LIMIT GREATEST(COALESCE(p_batch_size, 100), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE lootaura_v2.ingested_sales s
    SET
      geocode_attempts = s.geocode_attempts + 1,
      last_geocode_attempt_at = now()
    FROM candidates c
    WHERE s.id = c.id
    RETURNING
      s.id,
      s.normalized_address,
      s.address_raw,
      s.city,
      s.state,
      s.geocode_attempts,
      s.failure_reasons
  )
  SELECT
    claimed.id,
    claimed.normalized_address,
    claimed.address_raw,
    claimed.city,
    claimed.state,
    claimed.geocode_attempts,
    claimed.failure_reasons
  FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) TO service_role;

-- Address enrichment claim: one active row per (source_platform, canonical_source_url).
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
