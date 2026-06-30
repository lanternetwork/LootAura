import { describe, expect, it } from 'vitest'
import { resolveYstmListingCityAuthority } from '@/lib/ingestion/ystmListingCityAuthority'

/** Listing city authority resolution for external page sources. */
describe('resolveYstmListingCityAuthority', () => {
  it('prefers address tail when it conflicts with URL municipality and the street line is concrete', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730001/listing.html'
    const addressRaw = '123 Example St, Munster, IN 46321'
    const r = resolveYstmListingCityAuthority(href, addressRaw)
    expect(r.isYstmPath).toBe(true)
    expect(r.resolvedCity).toBe('Munster')
    expect(r.addressTailCity).toBe('Munster')
    expect(r.cityConflict).toBe(true)
    expect(r.citySource).toBe('address_tail')
    expect(r.pathCitySlug).toBe('Fair-Oaks')
    expect(r.streetConcrete).toBe(true)
  })

  it('prefers URL municipality when tail conflicts but street before tail is not concrete', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730001/listing.html'
    const addressRaw = 'Near Hwy 30 and Main, Munster, IN 46321'
    const r = resolveYstmListingCityAuthority(href, addressRaw)
    expect(r.resolvedCity).toBe('Fair Oaks')
    expect(r.citySource).toBe('listing_url')
    expect(r.streetConcrete).toBe(false)
  })

  it('uses real city slug after hub when address tail matches URL (no conflict)', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago.html/Park-City/100-Main-St/38730002/listing.html'
    const r = resolveYstmListingCityAuthority(href, '1 N Main, Park City, IL 60466')
    expect(r.isYstmPath).toBe(true)
    expect(r.resolvedCity).toBe('Park City')
    expect(r.hubSegment).toBe('Chicago.html')
    expect(r.pathCitySlug).toBe('Park-City')
    expect(r.cityConflict).toBe(false)
    expect(r.citySource).toBe('listing_url')
  })

  it('prefers concrete address tail over hub path city when they conflict (Orland Park vs Palos Park)', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Illinois/Orland-Park/123-Oak-St/999/listing.html'
    const addressRaw = '123 Oak St, Palos Park, IL 60464'
    const r = resolveYstmListingCityAuthority(href, addressRaw)
    expect(r.cityConflict).toBe(true)
    expect(r.resolvedCity).toBe('Palos Park')
    expect(r.resolvedState).toBe('IL')
    expect(r.citySource).toBe('address_tail')
  })

  it('prefers concrete address tail over hub path city when they conflict (Midlothian vs Palos Heights)', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Illinois/Midlothian/456-Elm-Ave/888/listing.html'
    const addressRaw = '456 Elm Ave, Palos Heights, IL 60463'
    const r = resolveYstmListingCityAuthority(href, addressRaw)
    expect(r.cityConflict).toBe(true)
    expect(r.resolvedCity).toBe('Palos Heights')
    expect(r.citySource).toBe('address_tail')
  })

  it('normalizes Saint-John slug to Saint John', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Indiana/Saint-John/200-Oak-Ave/38730003/listing.html'
    const r = resolveYstmListingCityAuthority(href, null)
    expect(r.resolvedCity).toBe('Saint John')
    expect(r.pathCitySlug).toBe('Saint-John')
    expect(r.cityConflict).toBe(false)
  })

  it('uses address tail only when URL is not a YSTM listing path', () => {
    const r = resolveYstmListingCityAuthority(
      'https://example.test/some/other/path',
      '100 Main St, Louisville, KY 40202'
    )
    expect(r.isYstmPath).toBe(false)
    expect(r.resolvedCity).toBe('Louisville')
    expect(r.citySource).toBe('address_tail')
    expect(r.cityConflict).toBe(false)
  })

  it('uses hub base name when segment after hub looks like a street slug', () => {
    const href = 'https://example.com/US/Illinois/Chicago.html/3805-N-Sacramento-Ave/161028326/listing.html'
    const r = resolveYstmListingCityAuthority(href, null)
    expect(r.resolvedCity).toBe('Chicago')
    expect(r.pathCitySlug).toBe('Chicago')
    expect(r.hubSegment).toBe('Chicago.html')
    expect(r.urlMunicipalityNormalized).toBe('Chicago')
  })
})
