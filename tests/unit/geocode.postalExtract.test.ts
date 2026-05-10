import { describe, it, expect } from 'vitest'
import { extractUsPostalCodeForGeocodeQuery } from '@/lib/geocode/geocodeAddress'

describe('extractUsPostalCodeForGeocodeQuery', () => {
  it('returns null for leading street number only (11020 … Mokena, IL)', () => {
    expect(
      extractUsPostalCodeForGeocodeQuery('11020 Front St Unit A, Mokena, IL', 'IL')
    ).toBeNull()
  })

  it('returns ZIP from … IL 60614', () => {
    expect(extractUsPostalCodeForGeocodeQuery('123 Main St, Chicago, IL 60614', 'IL')).toBe('60614')
  })

  it('returns null when no trusted postal tail (Apt 5, Chicago, IL)', () => {
    expect(extractUsPostalCodeForGeocodeQuery('123 Main St Apt 5, Chicago, IL', 'IL')).toBeNull()
  })

  it('returns null for 606 W … (leading 3 digits are not ZIP)', () => {
    expect(
      extractUsPostalCodeForGeocodeQuery('606 W Something St, Chicago, IL', 'IL')
    ).toBeNull()
  })

  it('rejects trailing ZIP that duplicates leading 5-digit house number', () => {
    expect(
      extractUsPostalCodeForGeocodeQuery('11020 Oak St, Chicago, IL, 11020', 'IL')
    ).toBeNull()
  })

  it('accepts lone trailing segment ZIP when state is supplied separately', () => {
    expect(extractUsPostalCodeForGeocodeQuery('100 North-Walk Rd, 95628', 'CA')).toBe('95628')
  })

  it('accepts … ST, ZIP with expected state', () => {
    expect(extractUsPostalCodeForGeocodeQuery('55 Oak Ln, Springfield, IL, 62704', 'IL')).toBe('62704')
  })

  it('accepts embedded … CO 80211 without commas before state', () => {
    expect(
      extractUsPostalCodeForGeocodeQuery('1234 Maple Hill Dr Denver CO 80211', 'CO')
    ).toBe('80211')
  })
})
