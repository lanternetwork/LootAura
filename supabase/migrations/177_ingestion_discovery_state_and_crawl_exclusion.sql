-- Phase 4: nationwide discovery cursor/lease + crawl exclusion for dead placeholders.

CREATE TABLE IF NOT EXISTS lootaura_v2.ingestion_discovery_state (
  key text PRIMARY KEY,
  state_cursor integer NOT NULL DEFAULT 0 CHECK (state_cursor >= 0),
  lease_owner text NULL,
  lease_expires_at timestamptz NULL,
  last_started_at timestamptz NULL,
  last_completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lootaura_v2.ingestion_discovery_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_discovery_state_service_role_all ON lootaura_v2.ingestion_discovery_state;
CREATE POLICY ingestion_discovery_state_service_role_all ON lootaura_v2.ingestion_discovery_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON lootaura_v2.ingestion_discovery_state TO service_role;

INSERT INTO lootaura_v2.ingestion_discovery_state (key, state_cursor)
VALUES ('source_discovery_nationwide', 0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE lootaura_v2.ingestion_discovery_state IS
  'Singleton lease + resumable state cursor for nationwide external source discovery cron.';

ALTER TABLE lootaura_v2.ingestion_city_configs
  ADD COLUMN IF NOT EXISTS source_discovery_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_excluded_at timestamptz;

COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_discovery_failure_count IS
  'Incremented on automated discovery/healing failures; used for placeholder remediation policy.';
COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_excluded_at IS
  'When set, row is excluded from crawlable ingestion rotation (row remains enabled; not deleted).';

CREATE INDEX IF NOT EXISTS idx_ingestion_city_configs_crawl_excluded
  ON lootaura_v2.ingestion_city_configs (source_crawl_excluded_at)
  WHERE source_platform = 'external_page_source' AND source_crawl_excluded_at IS NOT NULL;
