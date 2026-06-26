import { describe, expect, it } from 'vitest'
import {
  isIngestedSaleDuplicateSuppressed,
  isSaleSeoIndexEligible,
} from '@/lib/seo/isSaleSeoIndexEligible'

const YSTM_LISTING_URL = 'https://yardsaletreasuremap.com/US/KY/Louisville/1/listing.html'

const baseSale = {
  status: 'published',
  archived_at: null,
  moderation_status: 'approved',
  ends_at: null,
  external_source_url: YSTM_LISTING_URL,
  lat: 32.78,
  lng: -96.8,
  ingestedIsDuplicate: false,
  ingestedSuperseded: false,
}

describe('isSaleSeoIndexEligible', () => {
  it('requires YSTM detail URL and coordinates', () => {
    expect(isSaleSeoIndexEligible(baseSale)).toBe(true)
    expect(
      isSaleSeoIndexEligible({ ...baseSale, external_source_url: 'https://example.com/sale/1' })
    ).toBe(false)
    expect(isSaleSeoIndexEligible({ ...baseSale, lat: null })).toBe(false)
    expect(isSaleSeoIndexEligible({ ...baseSale, lng: null })).toBe(false)
  })

  it('rejects ingested duplicate or superseded sales', () => {
    expect(isSaleSeoIndexEligible({ ...baseSale, ingestedIsDuplicate: true })).toBe(false)
    expect(isSaleSeoIndexEligible({ ...baseSale, ingestedSuperseded: true })).toBe(false)
  })

  it('rejects non-phase-4 visible sales', () => {
    expect(isSaleSeoIndexEligible({ ...baseSale, status: 'draft' })).toBe(false)
    expect(
      isSaleSeoIndexEligible({ ...baseSale, moderation_status: 'hidden_by_admin' })
    ).toBe(false)
  })
})

describe('isIngestedSaleDuplicateSuppressed', () => {
  it('detects duplicate and superseded ingested rows', () => {
    expect(isIngestedSaleDuplicateSuppressed({ is_duplicate: true })).toBe(true)
    expect(
      isIngestedSaleDuplicateSuppressed({ superseded_by_ingested_sale_id: 'ing-1' })
    ).toBe(true)
    expect(isIngestedSaleDuplicateSuppressed({})).toBe(false)
  })
})
