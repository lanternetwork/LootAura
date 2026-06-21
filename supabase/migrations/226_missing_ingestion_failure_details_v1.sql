-- LIST_FAST_INSERT_FAILURE_DIAGNOSTIC_V1: persist sanitized insert failure details on observations.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS missing_ingestion_failure_details jsonb NULL;

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.missing_ingestion_failure_details IS
  'Sanitized missing-ingest diagnostics (e.g. list_fast_insert Postgres/collision detail).';
