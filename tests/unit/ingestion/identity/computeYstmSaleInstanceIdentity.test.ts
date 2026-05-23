import { describe, expect, it } from 'vitest'
import {
  buildSaleInstanceKey,
  canonicalDateWindow,
  computeYstmSaleInstanceIdentity,
  normalizeLocationBucket,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { extractYstmSourceListingId } from '@/lib/ingestion/identity/ystmSourceListingId'

/** Hub-style path (≥6 segments) required by parseYstmListingPathParts. */
const LISTING_URL =
  'https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html/961002738/listing.html'

describe('ystmSourceListingId', () => {
  it('extracts numeric listing segment from YSTM detail URL', () => {
    expect(extractYstmSourceListingId(LISTING_URL)).toBe('961002738')
  })
})

describe('canonicalDateWindow', () => {
  it('normalizes open-ended windows', () => {
    expect(canonicalDateWindow('2026-06-01', null)).toBe('2026-06-01|open')
    expect(canonicalDateWindow(null, null)).toBe('nodate|open')
  })
})

describe('computeYstmSaleInstanceIdentity', () => {
  it('returns null for non-YSTM URLs', () => {
    expect(
      computeYstmSaleInstanceIdentity({
        sourcePlatform: 'external_page_source',
        sourceUrl: 'https://example.com/sale',
        state: 'TX',
        city: 'Austin',
        normalizedAddress: '123 main st',
        dateStart: '2026-05-10',
        dateEnd: '2026-05-12',
      })
    ).toBeNull()
  })

  it('builds stable key from listing id + location + dates', () => {
    const a = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 Main St',
      dateStart: '2026-05-10',
      dateEnd: '2026-05-12',
      title: 'Garage Sale',
      description: 'Lots of stuff',
      seenAtIso: '2026-05-22T12:00:00.000Z',
    })
    const b = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 main st',
      dateStart: '2026-05-10',
      dateEnd: '2026-05-12',
      title: 'Garage Sale',
      description: 'Lots of stuff',
      seenAtIso: '2026-05-22T12:00:00.000Z',
    })
    expect(a?.source_listing_id).toBe('961002738')
    expect(a?.sale_instance_key).toBe(b?.sale_instance_key)
    expect(a?.sale_instance_key).toContain('961002738')
    expect(a?.sale_instance_fingerprint).toHaveLength(64)
  })

  it('changes key when date window changes beyond same listing', () => {
    const sameListing = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 main st',
      dateStart: '2026-05-10',
      dateEnd: '2026-05-12',
    })
    const newDates = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: LISTING_URL,
      state: 'TX',
      city: 'Austin',
      normalizedAddress: '123 main st',
      dateStart: '2026-06-10',
      dateEnd: '2026-06-12',
    })
    expect(sameListing?.sale_instance_key).not.toBe(newDates?.sale_instance_key)
  })

  it('uses content hash fallback when listing id missing', () => {
    const url =
      'https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html/no-id-segment/listing.html'
    const key = buildSaleInstanceKey({
      sourcePlatform: 'external_page_source',
      locationBucket: normalizeLocationBucket({
        state: 'TX',
        city: 'Austin',
        normalizedAddress: '123 main st',
      }),
      dateWindow: canonicalDateWindow('2026-05-10', '2026-05-12'),
      sourceListingId: null,
      sourceContentHash: 'abc123contenthash000000000000000000000000000000000000000000',
    })
    expect(key).toContain('content:')
    expect(extractYstmSourceListingId(url)).toBeNull()
  })
})
