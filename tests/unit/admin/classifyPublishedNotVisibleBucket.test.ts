import { describe, expect, it } from 'vitest'

import {
  classifyPublishedNotVisibleBucket,
  detectPublishedNotVisibleMismatch,
  passesPhase4PublicVisibility,
} from '@/lib/admin/classifyPublishedNotVisibleBucket'
import type {
  PublishedNotVisibleIngestedRow,
  PublishedNotVisibleObservationRow,
  PublishedNotVisibleSaleRow,
} from '@/lib/admin/publishedNotVisibleDistributionTypes'

const NOW_MS = Date.parse('2026-06-18T12:00:00.000Z')

function observation(
  overrides: Partial<PublishedNotVisibleObservationRow> = {}
): PublishedNotVisibleObservationRow {
  return {
    canonical_url: 'https://www.yardsaletreasuremap.com/sale/abc',
    matched_sale_id: null,
    matched_ingested_sale_id: null,
    sale_instance_key: null,
    lootaura_visible: false,
    appearance_source: null,
    false_exclusion_secondary_tags: [],
    match_method: null,
    missing_ingestion_outcome: null,
    missing_ingestion_failure_reason: null,
    missing_ingestion_replay_count: 0,
    ...overrides,
  }
}

function ingested(overrides: Partial<PublishedNotVisibleIngestedRow> = {}): PublishedNotVisibleIngestedRow {
  return {
    id: 'ingested-1',
    source_url: 'https://www.yardsaletreasuremap.com/sale/abc',
    status: 'published',
    published_sale_id: 'sale-1',
    sale_instance_key: 'key-1',
    is_duplicate: false,
    ...overrides,
  }
}

function sale(overrides: Partial<PublishedNotVisibleSaleRow> = {}): PublishedNotVisibleSaleRow {
  return {
    id: 'sale-1',
    status: 'published',
    archived_at: null,
    ends_at: '2026-12-31T00:00:00.000Z',
    moderation_status: null,
    ...overrides,
  }
}

function classify(input: {
  observation?: Partial<PublishedNotVisibleObservationRow>
  ingested?: PublishedNotVisibleIngestedRow | null
  linkedSale?: PublishedNotVisibleSaleRow | null
  linkedSaleId?: string | null
  visibleInPublishedIndex?: boolean
}) {
  const obs = observation(input.observation)
  const ing = input.ingested === undefined ? ingested() : input.ingested
  const linkedSaleId =
    input.linkedSaleId ??
    ing?.published_sale_id ??
    obs.matched_sale_id ??
    input.linkedSale?.id ??
    null

  return classifyPublishedNotVisibleBucket({
    observation: obs,
    ingested: ing,
    linkedSale: input.linkedSale ?? (linkedSaleId ? sale({ id: linkedSaleId }) : null),
    linkedSaleId,
    visibleInPublishedIndex: input.visibleInPublishedIndex ?? false,
    nowMs: NOW_MS,
  })
}

describe('passesPhase4PublicVisibility', () => {
  it('accepts published live sales', () => {
    expect(passesPhase4PublicVisibility(sale(), NOW_MS)).toBe(true)
  })

  it('rejects archived sales', () => {
    expect(
      passesPhase4PublicVisibility(
        sale({ status: 'archived', archived_at: '2026-01-01T00:00:00.000Z' }),
        NOW_MS
      )
    ).toBe(false)
  })

  it('rejects moderation hidden sales', () => {
    expect(
      passesPhase4PublicVisibility(sale({ moderation_status: 'hidden_by_admin' }), NOW_MS)
    ).toBe(false)
  })

  it('rejects expired sales', () => {
    expect(
      passesPhase4PublicVisibility(sale({ ends_at: '2026-06-17T00:00:00.000Z' }), NOW_MS)
    ).toBe(false)
  })
})

describe('classifyPublishedNotVisibleBucket', () => {
  it('classifies visible linked sale as audit bug signal', () => {
    expect(classify({ linkedSale: sale() })).toBe('VISIBLE_SALE')
  })

  it('classifies archived linked sale', () => {
    expect(
      classify({
        linkedSale: sale({ status: 'archived', archived_at: '2026-01-01T00:00:00.000Z' }),
      })
    ).toBe('ARCHIVED')
  })

  it('classifies moderation hidden linked sale', () => {
    expect(
      classify({
        linkedSale: sale({ moderation_status: 'hidden_by_admin' }),
      })
    ).toBe('MODERATION_HIDDEN')
  })

  it('classifies expired linked sale', () => {
    expect(classify({ linkedSale: sale({ ends_at: '2026-06-17T00:00:00.000Z' }) })).toBe('EXPIRED')
  })

  it('classifies missing linkage as NO_MATCHED_SALE', () => {
    expect(
      classify({
        ingested: null,
        linkedSale: null,
        linkedSaleId: null,
        observation: { matched_sale_id: null, matched_ingested_sale_id: null },
      })
    ).toBe('NO_MATCHED_SALE')
  })

  it('classifies identity mismatch', () => {
    expect(
      detectPublishedNotVisibleMismatch({
        observation: observation({ matched_sale_id: 'sale-a', sale_instance_key: 'key-1' }),
        ingested: ingested({ published_sale_id: 'sale-b', sale_instance_key: 'key-2' }),
        linkedSale: sale({ id: 'sale-b' }),
        linkedSaleId: 'sale-b',
        visibleInPublishedIndex: false,
        nowMs: NOW_MS,
      })
    ).toBe(true)

    expect(
      classify({
        observation: { matched_sale_id: 'sale-a' },
        ingested: ingested({ published_sale_id: 'sale-b' }),
        linkedSale: sale({ id: 'sale-b', ends_at: '2026-06-17T00:00:00.000Z' }),
        linkedSaleId: 'sale-b',
      })
    ).toBe('MISMATCH')
  })

  it('classifies stale observation when sale passes phase4', () => {
    expect(
      classify({
        observation: { false_exclusion_secondary_tags: ['observation_stale'] },
        linkedSale: sale(),
        visibleInPublishedIndex: false,
      })
    ).toBe('VISIBLE_SALE')
  })

  it('classifies stale observation when visible in published index without linked sale', () => {
    expect(
      classify({
        ingested: ingested({ published_sale_id: null }),
        linkedSale: null,
        linkedSaleId: null,
        visibleInPublishedIndex: true,
      })
    ).toBe('STALE_OBSERVATION')
  })

  it('classifies missing linkage as NO_MATCHED_SALE even with stale tag', () => {
    expect(
      classify({
        ingested: null,
        linkedSale: null,
        linkedSaleId: null,
        observation: {
          matched_sale_id: null,
          false_exclusion_secondary_tags: ['observation_stale'],
          missing_ingestion_outcome: 'ingested',
        },
      })
    ).toBe('NO_MATCHED_SALE')
  })

  it('classifies publish_hook stale path as disposition when sale filtered', () => {
    expect(
      classify({
        observation: { appearance_source: 'publish_hook' },
        linkedSale: sale({ ends_at: '2026-06-17T00:00:00.000Z' }),
      })
    ).toBe('EXPIRED')
  })

  it('falls back to OTHER when linkage exists without sale row', () => {
    expect(
      classify({
        ingested: ingested({ published_sale_id: 'missing-sale' }),
        linkedSale: null,
        linkedSaleId: 'missing-sale',
      })
    ).toBe('OTHER')
  })
})
