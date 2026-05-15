-- Deterministic, paginated reconciliation candidate selection (keyset over priority sort).
-- Matches lib/reconciliation/reconciliationSelection.ts computeReconciliationSortKey.
-- Cursor state: reconciliation_selection_state (service_role only).

BEGIN;

CREATE TABLE IF NOT EXISTS lootaura_v2.reconciliation_selection_state (
  state_key text PRIMARY KEY,
  cursor_tier smallint NULL,
  cursor_placeholder smallint NULL,
  cursor_never smallint NULL,
  cursor_ingest_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lootaura_v2.reconciliation_selection_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_selection_state_service_role_all
  ON lootaura_v2.reconciliation_selection_state;
CREATE POLICY reconciliation_selection_state_service_role_all
  ON lootaura_v2.reconciliation_selection_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.reconciliation_selection_state TO service_role;

INSERT INTO lootaura_v2.reconciliation_selection_state (state_key)
VALUES ('default')
ON CONFLICT (state_key) DO NOTHING;

COMMENT ON TABLE lootaura_v2.reconciliation_selection_state IS
  'Keyset cursor for reconciliation candidate ordering (per state_key). Service role only.';

-- Returns jsonb array of { ingest, sale_peek, sale_id } (aggregate-only ingest fields; no HTML).
CREATE OR REPLACE FUNCTION lootaura_v2.reconciliation_candidate_rows_page(
  p_now_utc timestamptz,
  p_pool_limit int,
  p_after_tier int DEFAULT NULL,
  p_after_placeholder int DEFAULT NULL,
  p_after_never int DEFAULT NULL,
  p_after_ingest_id uuid DEFAULT NULL,
  p_source_platform text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO lootaura_v2, pg_catalog
AS $fn$
WITH base AS (
  SELECT
    i.id,
    i.source_url,
    i.source_platform,
    i.city,
    i.state,
    i.normalized_address,
    i.zip_code,
    i.lat,
    i.lng,
    i.title,
    i.description,
    i.date_start,
    i.date_end,
    i.time_start,
    i.time_end,
    i.raw_payload,
    i.image_source_url,
    i.published_sale_id,
    i.last_source_sync_at,
    i.source_sync_status,
    i.source_sync_attempt_count,
    i.source_sync_failure_count,
    i.source_missing_count,
    i.source_placeholder_detected,
    i.source_content_hash,
    i.source_schedule_hash,
    i.source_image_hash,
    i.status,
    i.is_duplicate,
    i.last_source_change_at,
    s.id AS sale_table_id,
    s.address AS sale_address,
    s.city AS sale_city,
    s.state AS sale_state,
    s.date_start AS sale_date_start,
    s.date_end AS sale_date_end,
    s.time_start AS sale_time_start,
    s.time_end AS sale_time_end,
    (
      CASE
        WHEN COALESCE(i.source_placeholder_detected, false)
          OR i.last_source_sync_at IS NULL
          OR COALESCE(i.source_sync_failure_count, 0) > 0
          OR i.source_sync_status IS NOT DISTINCT FROM 'source_missing_soft'
        THEN 0::smallint
        WHEN i.last_source_sync_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (p_now_utc - (i.last_source_sync_at)::timestamptz)) * 1000 > 21600000
        THEN 1::smallint
        ELSE 2::smallint
      END
    ) AS tier_rank,
    (
      CASE WHEN COALESCE(i.source_placeholder_detected, false) THEN 0 ELSE 1 END
    )::smallint AS placeholder_sort,
    (
      CASE WHEN i.last_source_sync_at IS NULL THEN 0 ELSE 1 END
    )::smallint AS never_sort
  FROM lootaura_v2.ingested_sales i
  INNER JOIN lootaura_v2.sales s ON s.id = i.published_sale_id
  WHERE i.status IS NOT DISTINCT FROM 'published'
    AND COALESCE(i.is_duplicate, false) = false
    AND i.source_url IS NOT NULL
    AND i.published_sale_id IS NOT NULL
    AND s.status IS NOT DISTINCT FROM 'published'
    AND s.archived_at IS NULL
    AND s.ingested_sale_id IS NOT DISTINCT FROM i.id
    AND (s.ends_at IS NULL OR s.ends_at > p_now_utc)
    AND (
      s.moderation_status IS NULL
      OR BTRIM(COALESCE(s.moderation_status, '')) = ''
      OR s.moderation_status IS DISTINCT FROM 'hidden_by_admin'
    )
    AND (
      p_source_platform IS NULL
      OR TRIM(p_source_platform) = ''
      OR i.source_platform = TRIM(p_source_platform)
    )
),
filt AS (
  SELECT * FROM base b
  WHERE
    p_after_ingest_id IS NULL
    OR (
      (b.tier_rank, b.placeholder_sort, b.never_sort, b.id)
      > (p_after_tier::smallint, p_after_placeholder::smallint, p_after_never::smallint, p_after_ingest_id)
    )
),
ordered AS (
  SELECT * FROM filt
  ORDER BY tier_rank, placeholder_sort, never_sort, id
  LIMIT CASE
    WHEN p_pool_limit IS NULL OR p_pool_limit < 1 THEN 1
    WHEN p_pool_limit > 50000 THEN 50000
    ELSE p_pool_limit
  END
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'ingest', jsonb_build_object(
        'id', o.id,
        'source_url', o.source_url,
        'source_platform', o.source_platform,
        'city', o.city,
        'state', o.state,
        'normalized_address', o.normalized_address,
        'zip_code', o.zip_code,
        'lat', o.lat,
        'lng', o.lng,
        'title', o.title,
        'description', o.description,
        'date_start', o.date_start,
        'date_end', o.date_end,
        'time_start', o.time_start,
        'time_end', o.time_end,
        'raw_payload', o.raw_payload,
        'image_source_url', o.image_source_url,
        'published_sale_id', o.published_sale_id,
        'last_source_sync_at', o.last_source_sync_at,
        'source_sync_status', o.source_sync_status,
        'source_sync_attempt_count', o.source_sync_attempt_count,
        'source_sync_failure_count', o.source_sync_failure_count,
        'source_missing_count', o.source_missing_count,
        'source_placeholder_detected', o.source_placeholder_detected,
        'source_content_hash', o.source_content_hash,
        'source_schedule_hash', o.source_schedule_hash,
        'source_image_hash', o.source_image_hash,
        'status', o.status,
        'is_duplicate', o.is_duplicate,
        'last_source_change_at', o.last_source_change_at
      ),
      'sale_id', o.sale_table_id,
      'sale_peek', jsonb_build_object(
        'address', o.sale_address,
        'city', o.sale_city,
        'state', o.sale_state,
        'date_start', o.sale_date_start,
        'date_end', o.sale_date_end,
        'time_start', o.sale_time_start,
        'time_end', o.sale_time_end
      )
    )
    ORDER BY o.tier_rank, o.placeholder_sort, o.never_sort, o.id
  ),
  '[]'::jsonb
) AS payload
FROM ordered o;
$fn$;

REVOKE ALL ON FUNCTION lootaura_v2.reconciliation_candidate_rows_page(
  timestamptz, int, int, int, int, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lootaura_v2.reconciliation_candidate_rows_page(
  timestamptz, int, int, int, int, uuid, text
) TO service_role;

COMMENT ON FUNCTION lootaura_v2.reconciliation_candidate_rows_page IS
  'Bounded jsonb page of linked published ingested_sales + sale peek; ordered for reconciliation (matches TS sort key).';

COMMIT;
