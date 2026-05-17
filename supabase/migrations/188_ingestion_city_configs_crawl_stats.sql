-- Phase 1: per-config crawl yield / saturation stats for yield-aware scheduling.

ALTER TABLE lootaura_v2.ingestion_city_configs
  ADD COLUMN IF NOT EXISTS source_crawl_lifetime_fetched bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_lifetime_skipped bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_lifetime_inserted bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_fetched bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_skipped bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_inserted bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_crawl_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_crawl_last_insert_at timestamptz;

COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_window_fetched IS
  'Rolling crawl window (reset after 7d): listing URLs fetched from source pages.';
COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_window_skipped IS
  'Rolling crawl window: duplicate / suppressed URLs skipped at insert.';
COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_window_inserted IS
  'Rolling crawl window: new ingested_sales rows inserted.';
COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_last_insert_at IS
  'Last time this config produced at least one new ingested_sale insert.';

CREATE INDEX IF NOT EXISTS idx_ingestion_city_configs_crawl_last_insert
  ON lootaura_v2.ingestion_city_configs (source_crawl_last_insert_at)
  WHERE source_platform = 'external_page_source' AND enabled = true;
