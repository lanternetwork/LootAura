-- ACTIONABLE_MISSING_VALID_V1: terminal_disposition false-exclusion primary bucket.

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
      'terminal_disposition',
      'published_not_visible',
      'unknown'
    )
  );
