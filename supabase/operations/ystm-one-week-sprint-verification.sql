-- YSTM one-week sprint: ops verification (run in Supabase SQL editor)
-- Schema: lootaura_v2

-- 1) Graph enumeration registry
SELECT
  count(*) AS candidate_rows,
  count(DISTINCT state) AS states_with_candidates,
  count(*) FILTER (WHERE validation_status = 'validated') AS validated,
  count(*) FILTER (WHERE promoted_at IS NOT NULL) AS promoted
FROM lootaura_v2.ystm_source_page_candidates;

-- 2) Last 5 discovery cron runs
SELECT
  created_at,
  duration_ms,
  notes->'discovery_cron'->>'ok' AS ok,
  notes->'discovery_cron'->>'skipped' AS skipped,
  notes->'discovery_cron'->>'skipReason' AS skip_reason,
  notes->'discovery_cron'->>'statesScanned' AS states_scanned,
  notes->'discovery_cron'->>'catalogSize' AS catalog_size,
  notes->'discovery_cron'->'phasesCompleted' AS phases_completed,
  notes->'discovery_cron'->>'configsPromoted' AS configs_promoted,
  notes->'discovery_cron'->>'candidatePagesDiscovered' AS candidates_discovered
FROM lootaura_v2.ingestion_orchestration_runs
WHERE mode = 'discovery_cron'
ORDER BY created_at DESC
LIMIT 5;

-- 3) Discovery state cursor + lease
SELECT
  key,
  state_cursor,
  lease_owner,
  lease_expires_at,
  last_started_at,
  last_completed_at
FROM lootaura_v2.ingestion_discovery_state
WHERE key IN ('source_discovery_nationwide', 'ystm_nationwide');

-- 4) Crawlable vs empty source_pages (external_page_source, enabled)
SELECT
  count(*) FILTER (
    WHERE source_pages IS NOT NULL
      AND source_pages::text <> '[]'
      AND source_pages::text <> 'null'
      AND source_crawl_excluded_at IS NULL
  ) AS crawlable,
  count(*) FILTER (
    WHERE source_pages IS NULL
       OR source_pages::text = '[]'
       OR source_pages::text = 'null'
  ) AS no_source_pages,
  count(*) AS total_enabled
FROM lootaura_v2.ingestion_city_configs
WHERE enabled = true
  AND source_platform = 'external_page_source';
