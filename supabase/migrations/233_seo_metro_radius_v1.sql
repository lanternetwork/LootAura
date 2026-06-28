-- METRO_RADIUS_SEO_V1.0: radius-based metro inventory + per-metro page limit.

ALTER TABLE lootaura_v2.seo_metro_geography
  ADD COLUMN IF NOT EXISTS inventory_limit integer NOT NULL DEFAULT 250;

COMMENT ON COLUMN lootaura_v2.seo_metro_geography.inventory_limit IS
  'Max listings rendered on metro city/weekend pages from seo_metro_inventory snapshot.';

UPDATE lootaura_v2.seo_metro_geography
SET radius_miles = 25;

COMMENT ON COLUMN lootaura_v2.seo_metro_geography.radius_miles IS
  'Geographic search radius in miles from center_lat/center_lng for seo_metro_inventory membership.';
