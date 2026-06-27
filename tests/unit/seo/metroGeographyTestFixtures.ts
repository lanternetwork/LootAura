import type { SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'

const BASE_UPDATED_AT = '2026-06-01T00:00:00.000Z'

export const TEST_GEO_CHICAGO: SeoMetroGeographyRow = {
  slug: 'chicago-il',
  city: 'Chicago',
  state: 'IL',
  timezone: 'America/Chicago',
  center_lat: 41.8781,
  center_lng: -87.6298,
  radius_miles: 15,
  qualified_override: true,
  updated_at: BASE_UPDATED_AT,
}

export const TEST_GEO_DALLAS: SeoMetroGeographyRow = {
  slug: 'dallas-tx',
  city: 'Dallas',
  state: 'TX',
  timezone: 'America/Chicago',
  center_lat: 32.7767,
  center_lng: -96.797,
  radius_miles: 15,
  qualified_override: true,
  updated_at: BASE_UPDATED_AT,
}

export const TEST_GEO_LOUISVILLE: SeoMetroGeographyRow = {
  slug: 'louisville-ky',
  city: 'Louisville',
  state: 'KY',
  timezone: 'America/New_York',
  center_lat: 38.2527,
  center_lng: -85.7585,
  radius_miles: 10,
  qualified_override: true,
  updated_at: BASE_UPDATED_AT,
}

export const TEST_GEO_HOUSTON: SeoMetroGeographyRow = {
  slug: 'houston-tx',
  city: 'Houston',
  state: 'TX',
  timezone: 'America/Chicago',
  center_lat: 29.7604,
  center_lng: -95.3698,
  radius_miles: 15,
  qualified_override: true,
  updated_at: BASE_UPDATED_AT,
}

export const TEST_GEO_PHOENIX: SeoMetroGeographyRow = {
  slug: 'phoenix-az',
  city: 'Phoenix',
  state: 'AZ',
  timezone: 'America/Phoenix',
  center_lat: 33.4484,
  center_lng: -112.074,
  radius_miles: 15,
  qualified_override: false,
  updated_at: BASE_UPDATED_AT,
}

export const TEST_GEO_ATLANTA: SeoMetroGeographyRow = {
  slug: 'atlanta-ga',
  city: 'Atlanta',
  state: 'GA',
  timezone: 'America/New_York',
  center_lat: 33.749,
  center_lng: -84.388,
  radius_miles: 15,
  qualified_override: true,
  updated_at: BASE_UPDATED_AT,
}

export const TEST_GEO_AUSTIN: SeoMetroGeographyRow = {
  slug: 'austin-tx',
  city: 'Austin',
  state: 'TX',
  timezone: 'America/Chicago',
  center_lat: 30.2672,
  center_lng: -97.7431,
  radius_miles: 12,
  qualified_override: true,
  updated_at: BASE_UPDATED_AT,
}

export const TEST_SOCIAL_PRESET_GEOGRAPHY: SeoMetroGeographyRow[] = [
  TEST_GEO_CHICAGO,
  TEST_GEO_DALLAS,
  TEST_GEO_HOUSTON,
  TEST_GEO_PHOENIX,
  TEST_GEO_ATLANTA,
  TEST_GEO_AUSTIN,
  TEST_GEO_LOUISVILLE,
]

export function geographyBySlugFromRows(
  rows: SeoMetroGeographyRow[]
): Map<string, SeoMetroGeographyRow> {
  return new Map(rows.map((row) => [row.slug, row]))
}
