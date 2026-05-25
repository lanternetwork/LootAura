import { describe, expect, it } from 'vitest'
import { resolveCrossProviderIngestDisposition } from '@/lib/ingestion/identity/resolveCrossProviderIngestDisposition'
import type { CrossProviderConvergenceCandidate } from '@/lib/ingestion/identity/crossProviderDispositionTypes'

const CANONICAL = 'a'.repeat(64)

function candidate(
  partial: Partial<CrossProviderConvergenceCandidate> & Pick<CrossProviderConvergenceCandidate, 'id'>
): CrossProviderConvergenceCandidate {
  return {
    source_platform: 'external_page_source',
    source_url: 'https://example.com/a',
    canonical_sale_instance_key: CANONICAL,
    published_sale_id: null,
    is_duplicate: false,
    date_start: '2026-05-30',
    date_end: '2026-05-30',
    normalized_address: '1200 bardstown rd',
    title: 'Smith estate sale',
    lat: 38.235,
    lng: -85.72,
    ...partial,
  }
}

describe('resolveCrossProviderIngestDisposition', () => {
  it('returns would_link_observation for cross-platform canonical match', () => {
    const result = resolveCrossProviderIngestDisposition({
      incomingPlatform: 'estatesales_net',
      incomingCanonicalKey: CANONICAL,
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
      normalizedTitle: 'Smith estate sale',
      lat: 38.235,
      lng: -85.72,
      candidates: [
        candidate({
          id: 'ystm-1',
          source_platform: 'external_page_source',
          published_sale_id: 'pub-1',
        }),
      ],
    })
    expect(result.confidence).toBe('high')
    expect(result.disposition).toBe('would_link_observation')
    expect(result.matchMethod).toBe('canonical_key_exact')
    expect(result.isFalseNegative).toBe(false)
  })

  it('flags false negative when distinct disposition but canonical already published elsewhere', () => {
    const result = resolveCrossProviderIngestDisposition({
      incomingPlatform: 'estatesales_net',
      incomingCanonicalKey: CANONICAL,
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
      normalizedTitle: 'Garage sale',
      lat: 40,
      lng: -90,
      candidates: [
        candidate({
          id: 'ystm-1',
          source_platform: 'external_page_source',
          published_sale_id: 'pub-1',
          date_start: '2026-06-15',
          date_end: '2026-06-15',
          normalized_address: '999 other st',
          title: 'Unrelated',
        }),
      ],
    })
    expect(result.disposition).toBe('would_publish_distinct')
    expect(result.isFalseNegative).toBe(true)
    expect(result.matchedPublishedSaleId).toBe('pub-1')
  })

  it('returns distinct when no cross-platform candidates', () => {
    const result = resolveCrossProviderIngestDisposition({
      incomingPlatform: 'estatesales_net',
      incomingCanonicalKey: CANONICAL,
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: null,
      normalizedTitle: 'Sale',
      lat: null,
      lng: null,
      candidates: [
        candidate({
          id: 'esnet-1',
          source_platform: 'estatesales_net',
        }),
      ],
    })
    expect(result.disposition).toBe('would_publish_distinct')
    expect(result.confidence).toBe('distinct')
    expect(result.isFalseNegative).toBe(false)
  })
})
