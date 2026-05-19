-- Phase 4: detail-first crawl yield counters for saturation-aware scheduling.

ALTER TABLE lootaura_v2.ingestion_city_configs
  ADD COLUMN IF NOT EXISTS source_crawl_lifetime_detail_first_attempted bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_lifetime_detail_first_succeeded bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_detail_first_attempted bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_crawl_window_detail_first_succeeded bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN lootaura_v2.ingestion_city_configs.source_crawl_window_detail_first_succeeded IS
  'Rolling 7d: YSTM detail-first attempts that inserted ready at discovery.';
