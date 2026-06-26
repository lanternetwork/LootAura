-- SITEMAP_PERFORMANCE_REPAIR_V2: precomputed SEO state for crawler-scale sitemaps.

CREATE TABLE IF NOT EXISTS lootaura_v2.seo_enablement_snapshot (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  coverage_pct numeric NULL,
  effective_missing_valid integer NULL,
  duplicate_canonical_clusters integer NULL,
  published_active_inventory integer NULL,
  seo_gate_passed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lootaura_v2.seo_qualified_metros (
  slug text PRIMARY KEY,
  qualified boolean NOT NULL DEFAULT false,
  listing_count integer NOT NULL DEFAULT 0,
  crawlable_ratio numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lootaura_v2.seo_sitemap_inventory (
  sale_id uuid PRIMARY KEY,
  canonical_url text NOT NULL,
  city_slug text NULL,
  sort_order integer NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT seo_sitemap_inventory_sort_order_unique UNIQUE (sort_order)
);

CREATE INDEX IF NOT EXISTS seo_sitemap_inventory_sort_order_idx
  ON lootaura_v2.seo_sitemap_inventory (sort_order);

CREATE INDEX IF NOT EXISTS seo_qualified_metros_qualified_idx
  ON lootaura_v2.seo_qualified_metros (qualified)
  WHERE qualified = true;

COMMENT ON TABLE lootaura_v2.seo_enablement_snapshot IS
  'Singleton hourly snapshot of SEO enablement metric gate inputs (SITEMAP_PERFORMANCE_REPAIR_V2).';
COMMENT ON TABLE lootaura_v2.seo_qualified_metros IS
  'Hourly metro qualification snapshot for geo sitemaps.';
COMMENT ON TABLE lootaura_v2.seo_sitemap_inventory IS
  'Hourly prequalified listing inventory for listing sitemap chunks.';

GRANT ALL ON lootaura_v2.seo_enablement_snapshot TO service_role;
GRANT ALL ON lootaura_v2.seo_qualified_metros TO service_role;
GRANT ALL ON lootaura_v2.seo_sitemap_inventory TO service_role;
