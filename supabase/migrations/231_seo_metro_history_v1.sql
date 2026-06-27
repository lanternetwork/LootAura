-- CITY_PAGE_COVERAGE_V2.1: historical metro footprint for existence resolution.

CREATE TABLE IF NOT EXISTS lootaura_v2.seo_metro_history (
  slug text PRIMARY KEY,
  city text NOT NULL,
  state text NOT NULL,
  timezone text NOT NULL,
  inventory_count_90d integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_metro_history_inventory_count_90d_idx
  ON lootaura_v2.seo_metro_history (inventory_count_90d)
  WHERE inventory_count_90d > 0;

COMMENT ON TABLE lootaura_v2.seo_metro_history IS
  'Hourly 90-day published sale footprint per metro — existence-only (CITY_PAGE_COVERAGE_V2.1).';

GRANT ALL ON lootaura_v2.seo_metro_history TO service_role;
