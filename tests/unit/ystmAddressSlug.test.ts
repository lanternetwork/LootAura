import { describe, expect, it } from 'vitest'
import {
  addressLineFromYstmListingUrlSlug,
  enrichStreetLineWithPathMunicipalityWhenNoTail,
  slugSegmentToAddressLine,
} from '@/lib/ingestion/ystmAddressSlug'

describe('ystmAddressSlug', () => {
  it('slugSegmentToAddressLine decodes hyphens to spaces', () => {
    expect(slugSegmentToAddressLine('15200-S-80th-Ave')).toBe('15200 S 80th Ave')
  })

  it('addressLineFromYstmListingUrlSlug reads listing address segment', () => {
    const url =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/15200-S-80th-Ave/161028326/listing.html'
    expect(addressLineFromYstmListingUrlSlug(url)).toBe('15200 S 80th Ave')
  })

  it('returns null for see-source placeholder slug', () => {
    expect(slugSegmentToAddressLine('see-source-for-address')).toBeNull()
  })

  it('appends URL path municipality + state when line is numbered street but has no tail', () => {
    const url =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/15200-S-80th-Ave/161028326/listing.html'
    expect(enrichStreetLineWithPathMunicipalityWhenNoTail('15200 S 80th Ave', url)).toEqual({
      line: '15200 S 80th Ave, Chicago, IL',
      appended: true,
    })
  })

  it('does not append when address already has city/state tail', () => {
    const url =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/15200-S-80th-Ave/161028326/listing.html'
    const line = '15200 S 80th Ave, Chicago, IL 60652'
    expect(enrichStreetLineWithPathMunicipalityWhenNoTail(line, url)).toEqual({ line, appended: false })
  })
})
