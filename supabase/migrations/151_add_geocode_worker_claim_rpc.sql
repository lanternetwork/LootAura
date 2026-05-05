BEGIN;

CREATE INDEX IF NOT EXISTS idx_ingested_sales_geocode_claim
  ON lootaura_v2.ingested_sales(status, geocode_attempts, last_geocode_attempt_at);

CREATE OR REPLACE FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(
  p_batch_size integer DEFAULT 100,
  p_cooldown_minutes integer DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  normalized_address text,
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
      AND s.geocode_attempts < 3
      AND (
        s.last_geocode_attempt_at IS NULL
        OR s.last_geocode_attempt_at < now() - make_interval(mins => p_cooldown_minutes)
      )
    ORDER BY s.created_at ASC
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
      s.city,
      s.state,
      s.geocode_attempts,
      s.failure_reasons
  )
  SELECT
    claimed.id,
    claimed.normalized_address,
    claimed.city,
    claimed.state,
    claimed.geocode_attempts,
    claimed.failure_reasons
  FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) TO service_role;

COMMIT;

