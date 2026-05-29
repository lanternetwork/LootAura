-- SEO index rollout controls (admin dashboard; no Vercel env vars).
-- Key: seo_rollout

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS seo_public_indexing_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS seo_public_indexing_enabled_at timestamptz NULL;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS seo_public_indexing_disabled_at timestamptz NULL;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS seo_crawl_validation_passed boolean NOT NULL DEFAULT false;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS seo_crawl_validation_passed_at timestamptz NULL;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS seo_search_console_validation_passed boolean NOT NULL DEFAULT false;

ALTER TABLE lootaura_v2.ingestion_orchestration_state
  ADD COLUMN IF NOT EXISTS seo_search_console_validation_passed_at timestamptz NULL;

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor, seo_public_indexing_enabled)
VALUES ('seo_rollout', 0, false)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.seo_public_indexing_enabled IS
  'On key seo_rollout: master admin opt-in for public indexing (in addition to ingestion allowlist).';

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.seo_crawl_validation_passed IS
  'On key seo_rollout: Phase 5B crawl validation attested by admin.';

COMMENT ON COLUMN lootaura_v2.ingestion_orchestration_state.seo_search_console_validation_passed IS
  'On key seo_rollout: Phase 5A Search Console checklist attested by admin.';
