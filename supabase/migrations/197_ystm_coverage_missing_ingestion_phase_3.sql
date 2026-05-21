-- Phase 3: bounded queue ingesting missing valid YSTM URLs from coverage observations.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS missing_ingestion_attempted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS missing_ingestion_outcome text NULL
    CHECK (
      missing_ingestion_outcome IS NULL
      OR missing_ingestion_outcome IN (
        'skipped_visible',
        'skipped_existing',
        'published',
        'ingested',
        'failed'
      )
    ),
  ADD COLUMN IF NOT EXISTS missing_ingestion_failure_reason text NULL;

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_missing_queue_idx
  ON lootaura_v2.ystm_coverage_observations (canonical_url)
  WHERE ystm_valid_active = true AND lootaura_visible = false;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor)
VALUES ('ystm_coverage_missing_ingestion', 0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.missing_ingestion_outcome IS
  'Last bounded missing-URL ingest attempt outcome (detail-first + publish lifecycle).';
