import { describe, expect, it } from 'vitest'
import { evaluateTrustedLocalityAuthorityForIngestionCityConfig } from '@/lib/ingestion/trustedLocalityAuthorityForIngestionCityConfig'

const SALE_PHP =
  'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927'

describe('evaluateTrustedLocalityAuthorityForIngestionCityConfig', () => {
  it('trusts ZIP-primary locality when the address line lacks a City, ST tail (community-sale style)', () => {
    const r = evaluateTrustedLocalityAuthorityForIngestionCityConfig({
      sourceUrl: SALE_PHP,
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      processedCity: 'Griffith',
      processedState: 'IN',
      rawPayload: {},
    })
    expect(r).toEqual({ trusted: true, source: 'zip_locality_primary' })
  })

  it('trusts YSTM listing path authority when city/state match the resolved path', () => {
    // Path must satisfy `parseYstmListingPathParts` (≥6 segments under `/US/.../listing.html`).
    const url =
      'https://www.yardsaletreasuremap.com/US/Illinois/La-Grange/60525/123-main-st/listing.html'
    const r = evaluateTrustedLocalityAuthorityForIngestionCityConfig({
      sourceUrl: url,
      resolvedAddressRaw: '123 Main St, La Grange, IL 60525',
      processedCity: 'La Grange',
      processedState: 'IL',
      rawPayload: {},
    })
    expect(r).toEqual({ trusted: true, source: 'ystm_listing_url' })
  })

  it('trusts YSTM address tail when present and consistent (before ZIP-primary)', () => {
    const r = evaluateTrustedLocalityAuthorityForIngestionCityConfig({
      sourceUrl: SALE_PHP,
      resolvedAddressRaw: '1751 N Lafayette St, Griffith, IN 46319',
      processedCity: 'Griffith',
      processedState: 'IN',
      rawPayload: {},
    })
    expect(r).toEqual({ trusted: true, source: 'ystm_address_tail' })
  })

  it('does not trust arbitrary prose without path, tail, ZIP fixture, or forwarded authority', () => {
    const r = evaluateTrustedLocalityAuthorityForIngestionCityConfig({
      sourceUrl: SALE_PHP,
      resolvedAddressRaw: 'Somewhere vague in Indiana',
      processedCity: 'Griffith',
      processedState: 'IN',
      rawPayload: {},
    })
    expect(r.trusted).toBe(false)
  })

  it('trusts forwarded communitysale payload when source is allowlisted and matches', () => {
    const r = evaluateTrustedLocalityAuthorityForIngestionCityConfig({
      sourceUrl: SALE_PHP,
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      processedCity: 'Griffith',
      processedState: 'IN',
      rawPayload: {
        communitysaleLocalityAuthority: {
          source: 'zip_locality_authority',
          city: 'Griffith',
          state: 'IN',
        },
      },
    })
    expect(r).toEqual({ trusted: true, source: 'forwarded_communitysale_payload' })
  })

  it('rejects forwarded payload when city does not match processed locality', () => {
    const r = evaluateTrustedLocalityAuthorityForIngestionCityConfig({
      sourceUrl: SALE_PHP,
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      processedCity: 'Griffith',
      processedState: 'IN',
      rawPayload: {
        communitysaleLocalityAuthority: {
          source: 'zip_locality_authority',
          city: 'Chicago',
          state: 'IL',
        },
      },
    })
    expect(r).toEqual({ trusted: false, reason: 'forwarded_communitysale_payload_mismatch' })
  })
})
