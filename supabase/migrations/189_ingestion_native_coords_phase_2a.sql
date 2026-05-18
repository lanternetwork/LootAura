-- Phase 2A: YSTM native coordinates + durable address geocode cache.

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_coordinate_precision_check;

ALTER TABLE lootaura_v2.ingested_sales
  ADD CONSTRAINT ingested_sales_coordinate_precision_check
  CHECK (
    coordinate_precision IS NULL
    OR coordinate_precision IN (
      'exact_address',
      'intersection',
      'interpolated',
      'locality',
      'city_centroid',
      'provider_native'
    )
  );

COMMENT ON COLUMN lootaura_v2.ingested_sales.coordinate_precision IS
  'D2/2A: precision tier; locality/city_centroid must not publish; provider_native = YSTM embedded coords.';

CREATE TABLE IF NOT EXISTS lootaura_v2.address_geocode_cache (
  normalized_address_key text PRIMARY KEY,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  coordinate_precision text NOT NULL,
  geocode_method text NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz NULL,
  CONSTRAINT address_geocode_cache_coordinate_precision_check
    CHECK (
      coordinate_precision IN (
        'exact_address',
        'intersection',
        'interpolated',
        'provider_native'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_address_geocode_cache_updated_at
  ON lootaura_v2.address_geocode_cache (updated_at DESC);

COMMENT ON TABLE lootaura_v2.address_geocode_cache IS
  'Durable normalized-address → coordinates cache (Nominatim successes only; no failure rows).';

GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.address_geocode_cache TO service_role;

DROP FUNCTION IF EXISTS lootaura_v2.claim_ingested_sales_for_publish(integer);

CREATE FUNCTION lootaura_v2.claim_ingested_sales_for_publish(
  p_batch_size integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  source_platform text,
  source_url text,
  title text,
  description text,
  normalized_address text,
  city text,
  state text,
  zip_code text,
  lat numeric,
  lng numeric,
  date_start date,
  date_end date,
  time_start time,
  time_end time,
  image_cloudinary_url text,
  image_source_url text,
  raw_payload jsonb,
  published_sale_id uuid,
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
    WHERE (
      s.status = 'ready'
      AND s.is_duplicate = false
      AND s.published_sale_id IS NULL
      AND s.lat IS NOT NULL
      AND s.lng IS NOT NULL
      AND (
        s.coordinate_precision IS NULL
        OR s.coordinate_precision NOT IN ('locality', 'city_centroid')
      )
    )
    OR (
      s.status = 'publishing'
      AND s.updated_at < now() - interval '30 minutes'
      AND NOT (
        s.failure_details IS NOT NULL
        AND (s.failure_details->>'reason') = 'past_end_date'
        AND (s.failure_details->>'phase') = 'validation'
      )
    )
    ORDER BY s.updated_at ASC
    LIMIT GREATEST(COALESCE(p_batch_size, 100), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE lootaura_v2.ingested_sales s
    SET status = 'publishing'
    FROM candidates c
    WHERE s.id = c.id
    RETURNING s.*
  )
  SELECT
    claimed.id,
    claimed.source_platform,
    claimed.source_url,
    claimed.title,
    claimed.description,
    claimed.normalized_address,
    claimed.city,
    claimed.state,
    claimed.zip_code,
    claimed.lat,
    claimed.lng,
    claimed.date_start,
    claimed.date_end,
    claimed.time_start,
    claimed.time_end,
    claimed.image_cloudinary_url,
    claimed.image_source_url,
    claimed.raw_payload,
    claimed.published_sale_id,
    claimed.failure_reasons
  FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM authenticated;

COMMIT;
