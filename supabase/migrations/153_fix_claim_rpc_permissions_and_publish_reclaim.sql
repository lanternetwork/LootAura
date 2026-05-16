BEGIN;

-- Restrict claim RPC execution to service role only.
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) TO service_role;

-- Recreate publish claim RPC to reclaim stale "publishing" rows.
CREATE OR REPLACE FUNCTION lootaura_v2.claim_ingested_sales_for_publish(
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
    )
    OR (
      s.status = 'publishing'
      AND s.updated_at < now() - interval '30 minutes'
    )
    ORDER BY s.created_at ASC
    LIMIT GREATEST(COALESCE(p_batch_size, 100), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE lootaura_v2.ingested_sales s
    SET status = 'publishing'
    FROM candidates c
    WHERE s.id = c.id
    RETURNING
      s.id,
      s.source_platform,
      s.source_url,
      s.title,
      s.description,
      s.normalized_address,
      s.city,
      s.state,
      s.zip_code,
      s.lat,
      s.lng,
      s.date_start,
      s.date_end,
      s.time_start,
      s.time_end,
      s.image_cloudinary_url,
      s.failure_reasons
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
    claimed.failure_reasons
  FROM claimed;
END;
$$;

COMMIT;

