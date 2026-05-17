-- Phase D2: geocode confidence / precision / method metadata (no locality publishing).

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  ADD COLUMN IF NOT EXISTS geocode_confidence text NULL,
  ADD COLUMN IF NOT EXISTS coordinate_precision text NULL,
  ADD COLUMN IF NOT EXISTS geocode_method text NULL;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_geocode_confidence_check;

ALTER TABLE lootaura_v2.ingested_sales
  ADD CONSTRAINT ingested_sales_geocode_confidence_check
  CHECK (
    geocode_confidence IS NULL
    OR geocode_confidence IN ('high', 'medium', 'low')
  );

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
      'city_centroid'
    )
  );

COMMENT ON COLUMN lootaura_v2.ingested_sales.geocode_confidence IS
  'D2: coarse confidence for last geocode outcome (high/medium/low).';
COMMENT ON COLUMN lootaura_v2.ingested_sales.coordinate_precision IS
  'D2: precision tier; locality/city_centroid must not publish in D2.';
COMMENT ON COLUMN lootaura_v2.ingested_sales.geocode_method IS
  'D2: how coordinates were resolved (e.g. nominatim_exact, nominatim_intersection).';

CREATE INDEX IF NOT EXISTS idx_ingested_sales_coordinate_precision
  ON lootaura_v2.ingested_sales (coordinate_precision)
  WHERE coordinate_precision IS NOT NULL;

-- Publish claim: block non-publishable precision tiers (defense in depth).
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
