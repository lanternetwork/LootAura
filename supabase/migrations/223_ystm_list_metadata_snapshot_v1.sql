-- YSTM_NATIONAL_2HOUR_INGESTION_V1: list metadata snapshot + discovery priority on observations.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS list_metadata_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS list_metadata_hash text NULL,
  ADD COLUMN IF NOT EXISTS discovery_priority text NULL;

ALTER TABLE lootaura_v2.ystm_coverage_observations
  DROP CONSTRAINT IF EXISTS ystm_coverage_observations_discovery_priority_chk;

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD CONSTRAINT ystm_coverage_observations_discovery_priority_chk
  CHECK (
    discovery_priority IS NULL
    OR discovery_priority IN ('hot', 'warm', 'cold')
  );

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_hot_missing_idx
  ON lootaura_v2.ystm_coverage_observations (first_list_seen_at DESC)
  WHERE ystm_valid_active = true
    AND lootaura_visible = false
    AND discovery_priority = 'hot';

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.list_metadata_snapshot IS
  'Embedded metadataStr sale row from list page (YSTM 2h fresh discovery).';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.discovery_priority IS
  'hot/warm/cold queue priority for missing ingest (fresh inventory first).';
