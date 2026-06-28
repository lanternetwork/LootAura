-- RELIST_DETECTION_V1: reversible expired observations + relist audit fields.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS needs_detail_refresh boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relist_detected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS relist_reason text NULL,
  ADD COLUMN IF NOT EXISTS relist_previous_start_date date NULL,
  ADD COLUMN IF NOT EXISTS relist_previous_end_date date NULL,
  ADD COLUMN IF NOT EXISTS relist_current_start_date date NULL,
  ADD COLUMN IF NOT EXISTS relist_current_end_date date NULL;

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_needs_detail_refresh_idx
  ON lootaura_v2.ystm_coverage_observations (relist_detected_at ASC)
  WHERE needs_detail_refresh = true;

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.needs_detail_refresh IS
  'True when list crawl detected event-defining metadata change on a prior expired observation; schedule detail re-validation.';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.relist_reason IS
  'Comma-separated event fields that changed on list re-sight (start_date,end_date,title,thumbnail,address).';
