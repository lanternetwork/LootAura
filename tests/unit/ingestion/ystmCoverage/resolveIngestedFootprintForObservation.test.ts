import { describe, expect, it } from 'vitest'
import type { IngestedFootprintRow } from '@/lib/ingestion/ystmCoverage/resolveIngestedFootprintForObservation'
import {
  buildObservationFootprintInput,
  resolveIngestedFootprintForObservation,
  type IngestedFootprintResolverIndex,
} from '@/lib/ingestion/ystmCoverage/resolveIngestedFootprintForObservation'

const BASE_URL = 'https://yardsaletreasuremap.com/US/TX/Austin/1/listing.html'
const ALT_URL = 'https://yardsaletreasuremap.com/US/TX/Austin/alt/listing.html'

function ingestedRow(overrides: Partial<IngestedFootprintRow> = {}): IngestedFootprintRow {
  return {
    id: 'ing-1',
    source_url: BASE_URL,
    canonical_source_url: BASE_URL,
    status: 'needs_check',
    published_sale_id: null,
    is_duplicate: false,
    address_status: 'address_available',
    failure_reasons: [],
    date_start: '2026-06-10',
    date_end: '2026-06-11',
    catalog_repair_outcome: null,
    source_listing_id: '1',
    sale_instance_key: 'key-1',
    address_enrichment_attempts: null,
    next_enrichment_attempt_at: null,
    address_unlock_at: null,
    last_address_enrichment_attempt_at: null,
    superseded_by_ingested_sale_id: null,
    normalized_address: '123 main st austin tx',
    ...overrides,
  }
}

function indexWith(rows: {
  bySaleInstanceKey?: Record<string, IngestedFootprintRow[]>
  bySourceListingId?: Record<string, IngestedFootprintRow[]>
  aliasByCanonicalUrl?: Record<string, IngestedFootprintRow[]>
  directByCanonicalUrl?: Record<string, IngestedFootprintRow[]>
  byNormalizedAddress?: Record<string, IngestedFootprintRow[]>
}): IngestedFootprintResolverIndex {
  return {
    byId: new Map(),
    bySaleInstanceKey: new Map(Object.entries(rows.bySaleInstanceKey ?? {})),
    bySourceListingId: new Map(Object.entries(rows.bySourceListingId ?? {})),
    aliasByCanonicalUrl: new Map(Object.entries(rows.aliasByCanonicalUrl ?? {})),
    directByCanonicalUrl: new Map(Object.entries(rows.directByCanonicalUrl ?? {})),
    byNormalizedAddress: new Map(Object.entries(rows.byNormalizedAddress ?? {})),
  }
}

describe('resolveIngestedFootprintForObservation', () => {
  it('matches by sale_instance_key (test 1)', () => {
    const row = ingestedRow()
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: BASE_URL,
        saleInstanceKey: 'key-1',
        sourceListingId: null,
        normalizedAddress: null,
        dateStart: null,
        dateEnd: null,
      },
      indexWith({ bySaleInstanceKey: { 'key-1': [row] } })
    )
    expect(resolved?.matchMethod).toBe('sale_instance_key')
    expect(resolved?.ingested.id).toBe('ing-1')
  })

  it('matches by source_listing_id + date overlap (test 2)', () => {
    const row = ingestedRow({ sale_instance_key: null })
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: BASE_URL,
        saleInstanceKey: null,
        sourceListingId: '1',
        normalizedAddress: null,
        dateStart: '2026-06-10',
        dateEnd: '2026-06-11',
      },
      indexWith({ bySourceListingId: { '1': [row] } })
    )
    expect(resolved?.matchMethod).toBe('source_listing_id_date_overlap')
  })

  it('matches by source_url_alias (test 3)', () => {
    const row = ingestedRow({ source_url: ALT_URL, sale_instance_key: null, source_listing_id: null })
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: BASE_URL,
        saleInstanceKey: null,
        sourceListingId: null,
        normalizedAddress: null,
        dateStart: null,
        dateEnd: null,
      },
      indexWith({ aliasByCanonicalUrl: { [BASE_URL]: [row] } })
    )
    expect(resolved?.matchMethod).toBe('source_url_alias')
  })

  it('returns null when no match (test 6)', () => {
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: BASE_URL,
        saleInstanceKey: null,
        sourceListingId: null,
        normalizedAddress: null,
        dateStart: null,
        dateEnd: null,
      },
      indexWith({})
    )
    expect(resolved).toBeNull()
  })

  it('buildObservationFootprintInput reads list metadata dates and address', () => {
    const input = buildObservationFootprintInput({
      canonical_url: BASE_URL,
      sale_instance_key: 'key-1',
      source_listing_id: '1',
      list_metadata_snapshot: {
        canonicalUrl: BASE_URL,
        sourceUrl: BASE_URL,
        title: null,
        description: null,
        address: '  456 Oak St ',
        lat: null,
        lng: null,
        startDate: '2026-06-12',
        endDate: '2026-06-13',
        postedAt: null,
        imageUrls: [],
      },
    })
    expect(input.normalizedAddress).toBe('456 oak st')
    expect(input.dateStart).toBe('2026-06-12')
  })
})
