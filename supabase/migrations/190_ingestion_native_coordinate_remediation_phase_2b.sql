-- Phase 2B: autonomous YSTM native coordinate remediation (claim RPC + geocode guard).

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS native_coord_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS native_coord_last_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS native_coord_next_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS native_coord_failure_reason text NULL,
  ADD COLUMN IF NOT EXISTS native_coord_last_error text NULL,
  ADD COLUMN IF NOT EXISTS native_coord_claimed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS native_coord_claimed_by text NULL;

COMMENT ON COLUMN lootaura_v2.ingested_sales.native_coord_attempts IS
  'Phase 2B: YSTM native coordinate remediation attempts (separate from geocode_attempts).';
COMMENT ON COLUMN lootaura_v2.ingested_sales.native_coord_next_attempt_at IS
  'Do not claim for native remediation before this instant (cooldown after retryable failure).';

CREATE OR REPLACE FUNCTION lootaura_v2.is_ystm_detail_listing_url(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    p_url IS NOT NULL
    AND btrim(p_url) <> ''
    AND lower(p_url) ~ '^https?://([^/]+\.)?yardsaletreasuremap\.(com|net|org)/.*/(listing|userlisting)\.html'
$$;

CREATE OR REPLACE FUNCTION lootaura_v2.is_native_coord_needs_check_eligible(p_failure_details jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    p_failure_details IS NOT NULL
    AND (p_failure_details->'geocode_dead_letter') IS NOT NULL
    AND (p_failure_details->'geocode_dead_letter'->>'disposition') = 'retryable'
    AND COALESCE((p_failure_details->'geocode_dead_letter'->>'eligible_replay')::boolean, false) = true
    AND (p_failure_details->'geocode_dead_letter'->'reasons') ? 'transient_provider'
$$;

CREATE INDEX IF NOT EXISTS idx_ingested_sales_native_coord_claim
  ON lootaura_v2.ingested_sales (native_coord_next_attempt_at ASC NULLS FIRST, native_coord_attempts ASC, updated_at ASC)
  WHERE source_platform = 'external_page_source'
    AND lat IS NULL
    AND lng IS NULL
    AND published_sale_id IS NULL
    AND address_status = 'address_available'
    AND status IN ('needs_geocode', 'needs_check');

DROP FUNCTION IF EXISTS lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation(integer, integer, integer, text);

CREATE FUNCTION lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation(
  p_batch_size integer DEFAULT 75,
  p_cooldown_minutes integer DEFAULT 15,
  p_max_attempts integer DEFAULT 5,
  p_claimed_by text DEFAULT 'native_coord_worker'
)
RETURNS TABLE (
  id uuid,
  source_url text,
  address_raw text,
  normalized_address text,
  city text,
  state text,
  status text,
  native_coord_attempts integer,
  failure_details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT s.id
    FROM lootaura_v2.ingested_sales s
    WHERE s.source_platform = 'external_page_source'
      AND lootaura_v2.is_ystm_detail_listing_url(s.source_url)
      AND s.lat IS NULL
      AND s.lng IS NULL
      AND s.published_sale_id IS NULL
      AND s.status NOT IN ('expired', 'published', 'rejected')
      AND s.address_status = 'address_available'
      AND s.address_raw IS NOT NULL
      AND btrim(s.address_raw) <> ''
      AND (
        s.status = 'needs_geocode'
        OR (
          s.status = 'needs_check'
          AND lootaura_v2.is_native_coord_needs_check_eligible(s.failure_details)
        )
      )
      AND s.native_coord_attempts < GREATEST(COALESCE(p_max_attempts, 5), 1)
      AND (
        s.native_coord_next_attempt_at IS NULL
        OR s.native_coord_next_attempt_at <= now()
      )
      AND (
        s.native_coord_last_attempt_at IS NULL
        OR s.native_coord_last_attempt_at < now() - make_interval(mins => GREATEST(COALESCE(p_cooldown_minutes, 15), 0))
      )
      AND (
        s.native_coord_failure_reason IS NULL
        OR s.native_coord_failure_reason NOT LIKE 'terminal_%'
      )
    ORDER BY
      CASE WHEN s.native_coord_attempts = 0 THEN 0 ELSE 1 END ASC,
      COALESCE(s.native_coord_last_attempt_at, to_timestamp(0)) ASC,
      s.updated_at ASC,
      s.created_at ASC,
      s.id ASC
    LIMIT GREATEST(COALESCE(p_batch_size, 75), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE lootaura_v2.ingested_sales s
    SET
      native_coord_attempts = s.native_coord_attempts + 1,
      native_coord_last_attempt_at = now(),
      native_coord_claimed_at = now(),
      native_coord_claimed_by = COALESCE(NULLIF(btrim(p_claimed_by), ''), 'native_coord_worker')
    FROM candidates c
    WHERE s.id = c.id
    RETURNING
      s.id,
      s.source_url,
      s.address_raw,
      s.normalized_address,
      s.city,
      s.state,
      s.status,
      s.native_coord_attempts,
      s.failure_details
  )
  SELECT
    claimed.id,
    claimed.source_url,
    claimed.address_raw,
    claimed.normalized_address,
    claimed.city,
    claimed.state,
    claimed.status,
    claimed.native_coord_attempts,
    claimed.failure_details
  FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation(integer, integer, integer, text) TO service_role;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation(integer, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation(integer, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation(integer, integer, integer, text) FROM authenticated;

-- Geocode claim: defer YSTM detail rows until native remediation is exhausted.
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
SET search_path = lootaura_v2, pg_catalog
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
      AND (
        NOT (
          s.source_platform = 'external_page_source'
          AND lootaura_v2.is_ystm_detail_listing_url(s.source_url)
          AND s.lat IS NULL
          AND s.lng IS NULL
        )
        OR s.native_coord_failure_reason LIKE 'terminal_%'
        OR COALESCE(s.native_coord_attempts, 0) >= 5
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
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM authenticated;

COMMIT;
