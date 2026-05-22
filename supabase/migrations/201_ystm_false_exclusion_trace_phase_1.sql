-- Phase 1: ground-truth false-exclusion audit trace on coverage observations.

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD COLUMN IF NOT EXISTS false_exclusion_primary_bucket text NULL,
  ADD COLUMN IF NOT EXISTS false_exclusion_secondary_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS false_exclusion_summary text NULL,
  ADD COLUMN IF NOT EXISTS false_exclusion_evidence jsonb NULL,
  ADD COLUMN IF NOT EXISTS false_exclusion_traced_at timestamptz NULL;

ALTER TABLE lootaura_v2.ystm_coverage_observations
  DROP CONSTRAINT IF EXISTS ystm_coverage_observations_false_exclusion_bucket_chk;

ALTER TABLE lootaura_v2.ystm_coverage_observations
  ADD CONSTRAINT ystm_coverage_observations_false_exclusion_bucket_chk
  CHECK (
    false_exclusion_primary_bucket IS NULL
    OR false_exclusion_primary_bucket IN (
      'never_crawled',
      'crawl_not_yet_rotated',
      'url_duplicate_suppressed',
      'url_reuse_suspected',
      'soft_dedupe_suppressed',
      'expired_false_positive',
      'gated_false_positive',
      'detail_first_fallback',
      'address_validation_failed',
      'spatial_lookup_failed',
      'insert_failed',
      'publish_failed',
      'repair_pending',
      'repair_failed',
      'published_not_visible',
      'unknown'
    )
  );

CREATE INDEX IF NOT EXISTS ystm_coverage_observations_false_exclusion_bucket_idx
  ON lootaura_v2.ystm_coverage_observations (false_exclusion_primary_bucket)
  WHERE ystm_valid_active = true AND lootaura_visible = false;

COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.false_exclusion_primary_bucket IS
  'Phase 1: why this valid-active YSTM URL is missing from LootAura (single primary bucket).';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.false_exclusion_secondary_tags IS
  'Optional supplemental tags (config, missing-ingest, repair queue, stale observation).';
COMMENT ON COLUMN lootaura_v2.ystm_coverage_observations.false_exclusion_evidence IS
  'Non-PII trace evidence for admin replay (ingested status, config crawlability, outcomes).';
