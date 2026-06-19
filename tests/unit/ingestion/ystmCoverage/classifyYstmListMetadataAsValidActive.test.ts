import { describe, expect, it } from 'vitest'
import { classifyYstmListMetadataAsValidActive } from '@/lib/ingestion/ystmCoverage/classifyYstmListMetadataAsValidActive'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

function baseSale(overrides: Partial<YstmListMetadataSale> = {}): YstmListMetadataSale {
  return {
    canonicalUrl:
      'https://yardsaletreasuremap.com/us/illinois/chicago/123-main-st/listing.html',
    sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/123-main-st/listing.html',
    title: 'Garage sale',
    description: null,
    address: '123 Main St, Chicago, IL',
    lat: null,
    lng: null,
    startDate: '2026-07-01',
    endDate: '2026-07-01',
    postedAt: null,
    imageUrls: [],
    ...overrides,
  }
}

describe('classifyYstmListMetadataAsValidActive', () => {
  it('accepts valid metadata with address and dates', () => {
    expect(classifyYstmListMetadataAsValidActive(baseSale())).toEqual({ valid: true })
  })

  it('accepts native coords without street address', () => {
    expect(
      classifyYstmListMetadataAsValidActive(
        baseSale({ address: null, lat: 41.88, lng: -87.63 })
      )
    ).toEqual({ valid: true })
  })

  it('rejects expired sales', () => {
    const result = classifyYstmListMetadataAsValidActive(
      baseSale({ startDate: '2020-01-01', endDate: '2020-01-02' })
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('expired')
  })

  it('rejects gated-only rows', () => {
    const result = classifyYstmListMetadataAsValidActive(
      baseSale({
        address: 'See source for address after 2026-05-08',
        lat: null,
        lng: null,
      })
    )
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('gated_only')
  })
})
