import { describe, expect, it } from 'vitest'
import { resolveYstmListingCityAuthority } from '@/lib/ingestion/ystmListingCityAuthority'

describe('resolveYstmListingCityAuthority', () => {
  it('prefers listing URL municipality over conflicting address tail (Fair Oaks vs Munster)', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730001/listing.html'
    const addressRaw = '123 Example St, Munster, IN 46321'
    const r = resolveYstmListingCityAuthority(href, addressRaw)
    expect(r.isYstmPath).toBe(true)
    expect(r.resolvedCity).toBe('Fair Oaks')
    expect(r.addressTailCity).toBe('Munster')
    expect(r.cityConflict).toBe(true)
    expect(r.citySource).toBe('listing_url')
    expect(r.pathCitySlug).toBe('Fair-Oaks')
  })

  it('uses real city slug after hub *.html segment (Park City)', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago.html/Park-City/100-Main-St/38730002/listing.html'
    const r = resolveYstmListingCityAuthority(href, '1 N Main, Chicago, IL 60601')
    expect(r.isYstmPath).toBe(true)
    expect(r.resolvedCity).toBe('Park City')
    expect(r.hubSegment).toBe('Chicago.html')
    expect(r.pathCitySlug).toBe('Park-City')
    expect(r.cityConflict).toBe(true)
    expect(r.citySource).toBe('listing_url')
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
  })
})
