import { describe, expect, it } from 'vitest'
import type { YstmCoverageLootAuraMatchIndex } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageLootAuraMatchIndex'
import { matchYstmCoverageLootAuraFootprint } from '@/lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint'

function emptyIndex(): YstmCoverageLootAuraMatchIndex {
  return {
    visibleCanonicalUrls: new Set(),
    visibleByCanonicalUrl: new Map(),
    visibleAliasByCanonical: new Map(),
    bySaleInstanceKey: new Map(),
    bySourceListingId: new Map(),
    byNormalizedAddress: new Map(),
    publishedActiveTotal: 0,
  }
}

const CANON = 'https://yardsaletreasuremap.com/us/il/chicago/100-main/9001/listing.html'

describe('matchYstmCoverageLootAuraFootprint', () => {
  it('matches by sale_instance_key', () => {
    const index = emptyIndex()
    index.bySaleInstanceKey.set('external_page_source:IL|chicago|100 main:2026-06-01|open:9001', {
      saleId: 'sale-1',
      ingestedSaleId: 'ing-1',
      saleInstanceKey: 'external_page_source:IL|chicago|100 main:2026-06-01|open:9001',
      sourceListingId: '9001',
      canonicalSourceUrl: CANON,
      normalizedAddress: '100 main st',
      dateStart: '2026-06-01',
      dateEnd: null,
    })

    const result = matchYstmCoverageLootAuraFootprint(index, {
      canonicalUrl: CANON,
      saleInstanceKey: 'external_page_source:IL|chicago|100 main:2026-06-01|open:9001',
      sourceListingId: '9001',
      normalizedAddress: '100 main st',
      dateStart: '2026-06-01',
      dateEnd: null,
      identity: null,
    })

    expect(result.lootauraVisible).toBe(true)
    expect(result.matchMethod).toBe('sale_instance_key')
    expect(result.matchedSaleId).toBe('sale-1')
  })

  it('does not treat a stale visible URL as covered when sale_instance_key differs', () => {
    const index = emptyIndex()
    const staleRow = {
      saleId: 'sale-old',
      ingestedSaleId: 'ing-old',
      saleInstanceKey: 'external_page_source:IL|chicago|100 main:2025-01-01|open:9001',
      sourceListingId: '9001',
      canonicalSourceUrl: CANON,
      normalizedAddress: '100 main st',
      dateStart: '2025-01-01',
      dateEnd: null,
    }
    index.visibleCanonicalUrls.add(CANON)
    index.visibleByCanonicalUrl.set(CANON, staleRow)

    const result = matchYstmCoverageLootAuraFootprint(index, {
      canonicalUrl: CANON,
      saleInstanceKey: 'external_page_source:IL|chicago|100 main:2026-06-01|open:9001',
      sourceListingId: '9001',
      normalizedAddress: '100 main st',
      dateStart: '2026-06-01',
      dateEnd: null,
      identity: null,
    })

    expect(result.lootauraVisible).toBe(false)
    expect(result.matchMethod).toBeNull()
  })

  it('allows URL-only match on list pass when identity is unknown', () => {
    const index = emptyIndex()
    const row = {
      saleId: 'sale-1',
      ingestedSaleId: 'ing-1',
      saleInstanceKey: 'key-a',
      sourceListingId: '9001',
      canonicalSourceUrl: CANON,
      normalizedAddress: null,
      dateStart: null,
      dateEnd: null,
    }
    index.visibleCanonicalUrls.add(CANON)
    index.visibleByCanonicalUrl.set(CANON, row)

    const result = matchYstmCoverageLootAuraFootprint(index, {
      canonicalUrl: CANON,
      saleInstanceKey: null,
      sourceListingId: null,
      normalizedAddress: null,
      dateStart: null,
      dateEnd: null,
      identity: null,
    })

    expect(result.lootauraVisible).toBe(true)
    expect(result.matchMethod).toBe('source_url_visible')
  })
})
