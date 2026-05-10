import { describe, expect, it } from 'vitest'
import { addressLineFromYstmListingUrlSlug, slugSegmentToAddressLine } from '@/lib/ingestion/ystmAddressSlug'

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
})
