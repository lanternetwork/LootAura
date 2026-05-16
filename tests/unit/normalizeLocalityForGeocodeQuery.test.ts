import { describe, expect, it } from 'vitest'
import {
  minimalNormalizeLocalityForPrimaryGeocode,
  normalizeLocalityForGeocodeQuery,
} from '@/lib/ingestion/normalizeIngestionLocation'

describe('normalizeLocalityForGeocodeQuery', () => {
  it('expands slug-style hyphenated locality names (production pathCitySlug patterns)', () => {
    expect(normalizeLocalityForGeocodeQuery('Saint-John')).toBe('Saint John')
    expect(normalizeLocalityForGeocodeQuery('Park-City')).toBe('Park City')
    expect(normalizeLocalityForGeocodeQuery('Fair-Oaks')).toBe('Fair Oaks')
  })

  it('normalizes Unicode dash punctuation like en dash', () => {
    expect(normalizeLocalityForGeocodeQuery('Park\u2013City')).toBe('Park City')
  })

  it('does not match letter–hyphen–digit slug splits; digits are then removed by ingestion city sanitization', () => {
    expect(normalizeLocalityForGeocodeQuery('Route-66')).toBe('Route')
  })

  it('compound US place names still title-case to a space form suitable for geocoding', () => {
    expect(normalizeLocalityForGeocodeQuery('Wilkes-Barre')).toBe('Wilkes Barre')
  })

  it('returns null for null or empty', () => {
    expect(normalizeLocalityForGeocodeQuery(null)).toBeNull()
    expect(normalizeLocalityForGeocodeQuery('')).toBeNull()
    expect(normalizeLocalityForGeocodeQuery('   ')).toBeNull()
  })
})

describe('minimalNormalizeLocalityForPrimaryGeocode', () => {
  it('preserves hyphenated locality tokens (first-pass visible municipality)', () => {
    expect(minimalNormalizeLocalityForPrimaryGeocode('Fair-Oaks')).toBe('Fair-Oaks')
  })

  it('strips trailing .html and collapses whitespace', () => {
    expect(minimalNormalizeLocalityForPrimaryGeocode('  Chicago.html  ')).toBe('Chicago')
  })
})
