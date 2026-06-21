-- MISSING_INGEST_OUTCOME_CONSTRAINT_REPAIR_V1
-- Repairs stale inline CHECK from migration 197 (ystm_coverage_observations_missing_ingestion_outcome_check)
-- which omitted 'terminal'. Migration 221 added _chk but dropped the wrong constraint name, leaving both.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  DROP CONSTRAINT IF EXISTS ystm_coverage_observations_missing_ingestion_outcome_check;

ALTER TABLE lootaura_v2.ystm_coverage_observations
  DROP CONSTRAINT IF EXISTS ystm_coverage_observations_missing_ingestion_outcome_chk;

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD CONSTRAINT ystm_coverage_observations_missing_ingestion_outcome_chk
  CHECK (
    missing_ingestion_outcome IS NULL
    OR missing_ingestion_outcome IN (
      'skipped_visible',
      'skipped_existing',
      'published',
      'ingested',
      'failed',
      'terminal'
    )
  );

COMMENT ON CONSTRAINT ystm_coverage_observations_missing_ingestion_outcome_chk
  ON lootaura_v2.ystm_coverage_observations IS
  'Canonical missing-ingest outcome enum (includes terminal for fetch_failed replay exhaustion).';
