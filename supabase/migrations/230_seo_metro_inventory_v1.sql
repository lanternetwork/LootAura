-- CITY_PAGE_PERFORMANCE_REPAIR_V1: precomputed metro inventory for city landing pages.

CREATE TABLE IF NOT EXISTS lootaura_v2.seo_metro_inventory (
  metro_slug text NOT NULL,
  sale_id uuid NOT NULL,
  canonical_url text NOT NULL,
  title text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  starts_at date NOT NULL,
  ends_at date NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (metro_slug, sale_id)
);

CREATE INDEX IF NOT EXISTS seo_metro_inventory_metro_slug_idx
  ON lootaura_v2.seo_metro_inventory (metro_slug);

CREATE INDEX IF NOT EXISTS seo_metro_inventory_metro_slug_starts_at_idx
  ON lootaura_v2.seo_metro_inventory (metro_slug, starts_at DESC);

CREATE INDEX IF NOT EXISTS seo_metro_inventory_sale_id_idx
  ON lootaura_v2.seo_metro_inventory (sale_id);

ALTER TABLE lootaura_v2.seo_qualified_metros
  ADD COLUMN IF NOT EXISTS city text NULL,
  ADD COLUMN IF NOT EXISTS state text NULL,
  ADD COLUMN IF NOT EXISTS timezone text NULL;

COMMENT ON TABLE lootaura_v2.seo_metro_inventory IS
  'Hourly prequalified metro inventory for city/weekend landing pages (CITY_PAGE_PERFORMANCE_REPAIR_V1).';

GRANT ALL ON lootaura_v2.seo_metro_inventory TO service_role;
