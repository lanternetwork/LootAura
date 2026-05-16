BEGIN;

-- Orchestration: track publish rows closed as expired separately from operational publish_failed.
ALTER TABLE lootaura_v2.ingestion_orchestration_runs
  ADD COLUMN IF NOT EXISTS publish_expired_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_runs.publish_expired_count IS
  'Rows moved to ingested_sales.status=expired (past date_end) in this run; excluded from publish_failed_count.';

-- Terminal lifecycle: expired (stale listing window).
ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_status_check;

ALTER TABLE lootaura_v2.ingested_sales
  ADD CONSTRAINT ingested_sales_status_check
  CHECK (
    status IN (
      'ready',
      'needs_check',
      'needs_geocode',
      'publishing',
      'published',
      'publish_failed',
      'expired',
      'rejected'
    )
  );

-- Backfill: past_end_date validation outcomes were publish_failed + publish_error; move to expired + sale_expired.
UPDATE lootaura_v2.ingested_sales s
SET
  status = 'expired',
  failure_reasons = COALESCE(
    (
      SELECT jsonb_agg(elem ORDER BY elem)
      FROM (
        SELECT DISTINCT e AS elem
        FROM jsonb_array_elements_text(COALESCE(s.failure_reasons, '[]'::jsonb)) AS e
        WHERE e <> 'publish_error'
        UNION
        SELECT 'sale_expired'::text AS elem
      ) t
    ),
    '["sale_expired"]'::jsonb
  )
WHERE s.status = 'publish_failed'
  AND s.failure_details IS NOT NULL
  AND (s.failure_details->>'reason') = 'past_end_date';

COMMIT;
