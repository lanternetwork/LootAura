import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDetailFirstFieldProvenance } from '@/lib/ingestion/acquisition/detailFirstFieldProvenance'
import type { YstmDetailPageParsed } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { validateDetailEnrichedListing } from '@/lib/ingestion/acquisition/validateDetailEnrichedListing'

const LIST_SEED = {
  title: 'List title',
  description: null,
  addressRaw: 'Chicago IL',
  city: 'Chicago',
  state: 'IL',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/x/1/userlisting.html',
  imageSourceUrl: null,
  rawPayload: {},
}

function detailPage(overrides: Partial<YstmDetailPageParsed> = {}): YstmDetailPageParsed {
  return {
    title: 'Garage sale',
    description: null,
    addressRaw: '4443 S St Louis Ave, Chicago, IL',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    city: 'Chicago',
    state: 'IL',
    imageUrls: [],
    nativeCoords: null,
    cityConflict: false,
    ...overrides,
  }
}

function enrichedListing(detail: YstmDetailPageParsed) {
  const provenance = buildDetailFirstFieldProvenance(detail, LIST_SEED)
  const listing = {
    title: detail.title?.trim() ? detail.title : LIST_SEED.title,
    description: detail.description ?? LIST_SEED.description,
    addressRaw: detail.addressRaw?.trim() ? detail.addressRaw : LIST_SEED.addressRaw,
    city: detail.city?.trim() ? detail.city : LIST_SEED.city,
    state: detail.state?.trim() ? detail.state : LIST_SEED.state,
    startDate: detail.startDate ?? LIST_SEED.startDate,
    endDate: detail.endDate ?? LIST_SEED.endDate,
    sourceUrl: LIST_SEED.sourceUrl,
    imageSourceUrl: null,
    rawPayload: { detailFirstFieldProvenance: provenance },
  }
  return { listing, provenance }
}

describe('validateDetailEnrichedListing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts detail-enriched listing with publishable detail address', () => {
    const { listing, provenance } = enrichedListing(detailPage())
    const result = validateDetailEnrichedListing(listing, provenance)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.normalizedPublish).toContain('4443 s st louis ave')
    }
  })

  it('rejects detail address even when list seed address would pass geocode-ready', () => {
    const { listing, provenance } = enrichedListing(
      detailPage({ addressRaw: 'Chicago IL' })
    )
    const result = validateDetailEnrichedListing(listing, provenance)
    expect(result).toEqual({ ok: false, reason: 'address_validation_failed' })
    expect(listing.addressRaw).toBe('Chicago IL')
    expect(provenance.addressRaw).toBe('detail_page')
  })

  it('rejects expired detail-enriched sale windows', () => {
    const { listing, provenance } = enrichedListing(
      detailPage({ startDate: '2020-01-01', endDate: '2020-01-02' })
    )
    expect(validateDetailEnrichedListing(listing, provenance)).toEqual({
      ok: false,
      reason: 'expired_after_detail',
    })
  })
})
