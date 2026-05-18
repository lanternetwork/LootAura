-- Phase 3A: fresh-inventory acquisition stats (expired-at-discovery skips + duplicate kind yields).

ALTER TABLE lootaura_v2.ingestion_city_configs
  ADD COLUMN IF NOT EXISTS source_crawl_lifetime_skipped_expired bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_skipped_expired bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_lifetime_fresh_inserted bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_fresh_inserted bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_dup_existing_url bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_dup_cross_page bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_dup_canonical bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_dup_expired_row bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_window_skipped_expired IS
  'Rolling 7d: listings skipped at crawl because sale window already ended (not inserted).';
COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_window_fresh_inserted IS
  'Rolling 7d: new ingested_sales rows inserted with non-expired sale window at discovery.';
