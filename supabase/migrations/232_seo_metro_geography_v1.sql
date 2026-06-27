-- METRO_GEOGRAPHY_UNIFICATION_V1.1: canonical metro identity + radius membership.

CREATE TABLE IF NOT EXISTS lootaura_v2.seo_metro_geography (
  slug text PRIMARY KEY,
  city text NOT NULL,
  state text NOT NULL,
  timezone text NOT NULL,
  center_lat numeric NOT NULL,
  center_lng numeric NOT NULL,
  radius_miles integer NOT NULL,
  qualified_override boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_metro_geography_qualified_override_idx
  ON lootaura_v2.seo_metro_geography (qualified_override)
  WHERE qualified_override = true;

COMMENT ON TABLE lootaura_v2.seo_metro_geography IS
  'Canonical metro identity, center, and radius for content-surface membership (METRO_GEOGRAPHY_UNIFICATION_V1.1).';

GRANT ALL ON lootaura_v2.seo_metro_geography TO service_role;

INSERT INTO lootaura_v2.seo_metro_geography (
  slug, city, state, timezone, center_lat, center_lng, radius_miles, qualified_override
) VALUES
  ('louisville-ky', 'Louisville', 'KY', 'America/New_York', 38.2527, -85.7585, 10, true),
  ('lexington-ky', 'Lexington', 'KY', 'America/New_York', 38.0406, -84.5037, 10, true),
  ('cincinnati-oh', 'Cincinnati', 'OH', 'America/New_York', 39.1031, -84.5120, 12, true),
  ('indianapolis-in', 'Indianapolis', 'IN', 'America/Indiana/Indianapolis', 39.7684, -86.1581, 12, true),
  ('nashville-tn', 'Nashville', 'TN', 'America/Chicago', 36.1627, -86.7816, 15, true),
  ('st-louis-mo', 'St. Louis', 'MO', 'America/Chicago', 38.6270, -90.1994, 12, true),
  ('chicago-il', 'Chicago', 'IL', 'America/Chicago', 41.8781, -87.6298, 15, true),
  ('atlanta-ga', 'Atlanta', 'GA', 'America/New_York', 33.7490, -84.3880, 15, true),
  ('dallas-tx', 'Dallas', 'TX', 'America/Chicago', 32.7767, -96.7970, 15, true),
  ('houston-tx', 'Houston', 'TX', 'America/Chicago', 29.7604, -95.3698, 15, true),
  ('san-antonio-tx', 'San Antonio', 'TX', 'America/Chicago', 29.4241, -98.4936, 12, true),
  ('austin-tx', 'Austin', 'TX', 'America/Chicago', 30.2672, -97.7431, 12, true),
  ('phoenix-az', 'Phoenix', 'AZ', 'America/Phoenix', 33.4484, -112.0740, 15, false)
ON CONFLICT (slug) DO NOTHING;
