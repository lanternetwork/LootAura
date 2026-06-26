import { describe, expect, it } from 'vitest'
import {
  allowStaleInstanceKeyAliasBypass,
  buildObservationFootprintInput,
  resolveIngestedFootprintForObservation,
  type IngestedFootprintRow,
  type IngestedFootprintResolverIndex,
} from '@/lib/ingestion/ystmCoverage/resolveIngestedFootprintForObservation'

const BASE_URL = 'https://yardsaletreasuremap.com/US/TX/Austin/1/listing.html'
const PA_URL = 'https://yardsaletreasuremap.com/US/CA/Palo%20Alto/1/listing.html'
const ALT_URL = 'https://yardsaletreasuremap.com/US/TX/Austin/alt/listing.html'
const STALE_KEY = 'external_page_source:CA|scotts valley|addr:2026-06-10|2026-06-11:1'
const INGESTED_KEY = 'external_page_source:CA|palo alto|addr:2026-06-10|2026-06-11:1'

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

  it('allowStaleInstanceKeyAliasBypass is true only for PNV + ingested', () => {
    expect(
      allowStaleInstanceKeyAliasBypass({
        falseExclusionPrimaryBucket: 'published_not_visible',
        missingIngestionOutcome: 'ingested',
      })
    ).toBe(true)
    expect(
      allowStaleInstanceKeyAliasBypass({
        falseExclusionPrimaryBucket: 'published_not_visible',
        missingIngestionOutcome: null,
      })
    ).toBe(false)
    expect(
      allowStaleInstanceKeyAliasBypass({
        falseExclusionPrimaryBucket: 'never_crawled',
        missingIngestionOutcome: 'ingested',
      })
    ).toBe(false)
  })

  it('alias bypass resolves PNV row with stale sale_instance_key (V2)', () => {
    const row = ingestedRow({
      source_url: PA_URL,
      sale_instance_key: INGESTED_KEY,
      source_listing_id: '38821937',
    })
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: PA_URL,
        saleInstanceKey: STALE_KEY,
        sourceListingId: '38821937',
        normalizedAddress: null,
        dateStart: '2026-06-01',
        dateEnd: '2026-06-02',
        falseExclusionPrimaryBucket: 'published_not_visible',
        missingIngestionOutcome: 'ingested',
      },
      indexWith({ aliasByCanonicalUrl: { [PA_URL]: [row] } })
    )
    expect(resolved?.matchMethod).toBe('source_url_alias')
    expect(resolved?.ingested.id).toBe('ing-1')
  })

  it('alias rejects stale key mismatch when bucket field absent', () => {
    const row = ingestedRow({
      source_url: PA_URL,
      sale_instance_key: INGESTED_KEY,
      source_listing_id: '38821937',
    })
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: PA_URL,
        saleInstanceKey: STALE_KEY,
        sourceListingId: '38821937',
        normalizedAddress: null,
        dateStart: '2026-06-01',
        dateEnd: '2026-06-02',
        missingIngestionOutcome: 'ingested',
      },
      indexWith({ aliasByCanonicalUrl: { [PA_URL]: [row] } })
    )
    expect(resolved).toBeNull()
  })

  it('alias rejects stale key mismatch for never_crawled bucket', () => {
    const row = ingestedRow({
      source_url: PA_URL,
      sale_instance_key: INGESTED_KEY,
      source_listing_id: '38821937',
    })
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: PA_URL,
        saleInstanceKey: STALE_KEY,
        sourceListingId: '38821937',
        normalizedAddress: null,
        dateStart: '2026-06-01',
        dateEnd: '2026-06-02',
        falseExclusionPrimaryBucket: 'never_crawled',
        missingIngestionOutcome: 'ingested',
      },
      indexWith({ aliasByCanonicalUrl: { [PA_URL]: [row] } })
    )
    expect(resolved).toBeNull()
  })

  it('sale_instance_key still takes precedence when keys align', () => {
    const row = ingestedRow()
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: BASE_URL,
        saleInstanceKey: 'key-1',
        sourceListingId: null,
        normalizedAddress: null,
        dateStart: null,
        dateEnd: null,
        falseExclusionPrimaryBucket: 'published_not_visible',
        missingIngestionOutcome: 'ingested',
      },
      indexWith({
        bySaleInstanceKey: { 'key-1': [row] },
        aliasByCanonicalUrl: { [BASE_URL]: [ingestedRow({ id: 'ing-alias' })] },
      })
    )
    expect(resolved?.matchMethod).toBe('sale_instance_key')
    expect(resolved?.ingested.id).toBe('ing-1')
  })

  it('direct source_url_visible path stays strict without alias bypass', () => {
    const row = ingestedRow({
      source_url: PA_URL,
      sale_instance_key: INGESTED_KEY,
      source_listing_id: '38821937',
    })
    const resolved = resolveIngestedFootprintForObservation(
      {
        canonicalUrl: PA_URL,
        saleInstanceKey: STALE_KEY,
        sourceListingId: '38821937',
        normalizedAddress: null,
        dateStart: '2026-06-01',
        dateEnd: '2026-06-02',
        falseExclusionPrimaryBucket: 'published_not_visible',
        missingIngestionOutcome: 'ingested',
      },
      indexWith({ directByCanonicalUrl: { [PA_URL]: [row] } })
    )
    expect(resolved).toBeNull()
  })

  it('buildObservationFootprintInput passes PNV bypass fields from source row', () => {
    const input = buildObservationFootprintInput({
      canonical_url: PA_URL,
      sale_instance_key: STALE_KEY,
      missing_ingestion_outcome: 'ingested',
      false_exclusion_primary_bucket: 'published_not_visible',
    })
    expect(input.missingIngestionOutcome).toBe('ingested')
    expect(input.falseExclusionPrimaryBucket).toBe('published_not_visible')
  })
})
