-- Allow discovery and reconciliation cron rows in ingestion_orchestration_runs (observability only).

ALTER TABLE lootaura_v2.ingestion_orchestration_runs
  DROP CONSTRAINT IF EXISTS ingestion_orchestration_runs_mode_check;

ALTER TABLE lootaura_v2.ingestion_orchestration_runs
  ADD CONSTRAINT ingestion_orchestration_runs_mode_check
  CHECK (mode IN ('daily', 'ingestion', 'geocode_cron', 'discovery_cron', 'reconciliation_cron'));

COMMENT ON TABLE lootaura_v2.ingestion_orchestration_runs IS
  'Append-only orchestration metrics: daily/ingestion (fetch+geocode+publish), geocode_cron, discovery_cron, reconciliation_cron.';
