-- D2.5 follow-up: avoid reclaiming rows while a recent detail-page image parse is still in cooldown.

BEGIN;

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
      AND (
        s.failure_details IS NULL
        OR s.failure_details->'image_enrichment'->>'recorded_at' IS NULL
        OR NOT COALESCE((s.failure_details->'image_enrichment'->>'detailHtmlParsed')::boolean, false)
        OR (s.failure_details->'image_enrichment'->>'recorded_at')::timestamptz
          < now() - make_interval(mins => p_cooldown_minutes)
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

COMMIT;
