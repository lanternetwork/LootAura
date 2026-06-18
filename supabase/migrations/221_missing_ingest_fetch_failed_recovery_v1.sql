-- MISSING_INGEST_FETCH_FAILED_RECOVERY_V1: bounded replay for fetch_failed missing-ingest cohort.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  DROP CONSTRAINT IF EXISTS ystm_coverage_observations_missing_ingestion_outcome_chk;

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS missing_ingestion_replay_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_ingestion_last_retry_at timestamptz NULL;

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

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_fetch_failed_retry_idx
  ON lootaura_v2.ystm_coverage_observations (
    missing_ingestion_last_retry_at ASC NULLS FIRST,
    missing_ingestion_attempted_at ASC NULLS FIRST
  )
  WHERE ystm_valid_active = true
    AND lootaura_visible = false
    AND missing_ingestion_outcome = 'failed'
    AND missing_ingestion_failure_reason = 'fetch_failed';

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.missing_ingestion_replay_count IS
  'Bounded replay attempts for missing-ingest fetch_failed recovery (terminal at 3).';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.missing_ingestion_last_retry_at IS
  'Last fetch_failed replay attempt timestamp for missing-ingest recovery cron.';
