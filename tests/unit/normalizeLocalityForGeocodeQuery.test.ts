import { describe, expect, it } from 'vitest'
import { normalizeLocalityForGeocodeQuery } from '@/lib/ingestion/normalizeIngestionLocation'

describe('normalizeLocalityForGeocodeQuery', () => {
  it('expands slug-style hyphenated locality names (production pathCitySlug patterns)', () => {
    expect(normalizeLocalityForGeocodeQuery('Saint-John')).toBe('Saint John')
    expect(normalizeLocalityForGeocodeQuery('Park-City')).toBe('Park City')
    expect(normalizeLocalityForGeocodeQuery('Fair-Oaks')).toBe('Fair Oaks')
  })

  it('normalizes Unicode dash punctuation like en dash', () => {
    expect(normalizeLocalityForGeocodeQuery('Park\u2013City')).toBe('Park City')
  })

  it('does not treat digit segments as part of letter–letter slug splits (hyphen becomes space via city sanitize)', () => {
    expect(normalizeLocalityForGeocodeQuery('Route-66')).toBe('Route 66')
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
