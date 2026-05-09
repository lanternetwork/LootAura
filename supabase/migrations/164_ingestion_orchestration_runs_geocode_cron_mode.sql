-- Allow standalone geocode cron metrics rows (queue + backlog drain) alongside daily/ingestion orchestration.

ALTER TABLE lootaura_v2.ingestion_orchestration_runs
  DROP CONSTRAINT IF EXISTS ingestion_orchestration_runs_mode_check;

ALTER TABLE lootaura_v2.ingestion_orchestration_runs
  ADD CONSTRAINT ingestion_orchestration_runs_mode_check
  CHECK (mode IN ('daily', 'ingestion', 'geocode_cron'));
