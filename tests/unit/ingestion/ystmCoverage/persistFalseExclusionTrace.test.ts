import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FalseExclusionTraceEvidence,
  FalseExclusionUrlTrace,
} from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'

const mockFromBase = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockEq = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const NOW_MS = Date.parse('2026-06-17T12:00:00.000Z')
const NOW_ISO = '2026-06-17T12:00:00.000Z'
const URL = 'https://yardsaletreasuremap.com/US/TX/Granbury/1/listing.html'

const baseEvidence: FalseExclusionTraceEvidence = {
  hasIngestedRow: true,
  ingestedStatus: 'needs_check',
  ingestedPublishedSaleId: 'sale-1',
  isDuplicate: false,
  addressStatus: 'address_available',
  configEnabled: true,
  configHasSourcePages: true,
  configCrawlExcluded: false,
  configLastCrawlAt: null,
  missingIngestionOutcome: null,
  missingIngestionFailureReason: null,
  visibleInPublishedIndex: false,
  catalogRepairEligible: false,
  sourceListingId: '1',
  saleInstanceKey: 'external_page_source:TX|granbury|addr:2026-06-10|2026-06-11:1',
}

function baseTrace(overrides: Partial<FalseExclusionUrlTrace> = {}): FalseExclusionUrlTrace {
  return {
    canonicalUrl: URL,
    state: 'TX',
    city: 'Granbury',
    configKey: 'TX|Granbury',
    tracedAt: NOW_ISO,
    primaryBucket: 'published_not_visible',
    secondaryTags: [],
    summary: 'published not visible',
    evidence: baseEvidence,
    ...overrides,
  }
}

describe('shouldSkipPublishedNotVisibleTracePersist', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('skips when ystm_invalid_reason is archived', async () => {
    const { shouldSkipPublishedNotVisibleTracePersist } = await import(
      '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
    )

    expect(
      shouldSkipPublishedNotVisibleTracePersist(
        baseTrace(),
        { ystmInvalidReason: 'archived', linkedSale: null },
        NOW_MS
      )
    ).toBe(true)
  })

  it('skips when ystm_invalid_reason is expired', async () => {
    const { shouldSkipPublishedNotVisibleTracePersist } = await import(
      '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
    )

    expect(
      shouldSkipPublishedNotVisibleTracePersist(
        baseTrace(),
        { ystmInvalidReason: 'expired', linkedSale: null },
        NOW_MS
      )
    ).toBe(true)
  })

  it('skips when linked sale fails Phase 4 public visibility', async () => {
    const { shouldSkipPublishedNotVisibleTracePersist } = await import(
      '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
    )

    expect(
      shouldSkipPublishedNotVisibleTracePersist(
        baseTrace(),
        {
          ystmInvalidReason: null,
          linkedSale: {
            status: 'archived',
            archived_at: '2026-06-01T00:00:00.000Z',
            ends_at: null,
            moderation_status: null,
          },
        },
        NOW_MS
      )
    ).toBe(true)
  })

  it('does not skip legitimate published_not_visible with published linked sale', async () => {
    const { shouldSkipPublishedNotVisibleTracePersist } = await import(
      '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
    )

    expect(
      shouldSkipPublishedNotVisibleTracePersist(
        baseTrace(),
        {
          ystmInvalidReason: null,
          linkedSale: {
            status: 'published',
            archived_at: null,
            ends_at: '2026-12-31T00:00:00.000Z',
            moderation_status: null,
          },
        },
        NOW_MS
      )
    ).toBe(false)
  })

  it('does not skip non-PNV buckets even when disposition signals are present', async () => {
    const { shouldSkipPublishedNotVisibleTracePersist } = await import(
      '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
    )

    expect(
      shouldSkipPublishedNotVisibleTracePersist(
        baseTrace({ primaryBucket: 'repair_pending' }),
        {
          ystmInvalidReason: 'archived',
          linkedSale: {
            status: 'archived',
            archived_at: '2026-06-01T00:00:00.000Z',
            ends_at: null,
            moderation_status: null,
          },
        },
        NOW_MS
      )
    ).toBe(false)
  })
})

describe('persistFalseExclusionTraces', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
    mockUpdate.mockReset()
    mockEq.mockReset()

    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFromBase.mockReturnValue({ update: mockUpdate })
  })

  it('persists only traced_at when guard fires (Granbury-shaped archived row)', async () => {
    const { persistFalseExclusionTraces } = await import(
      '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
    )

    await persistFalseExclusionTraces(
      {} as never,
      [
        {
          trace: baseTrace(),
          persistContext: {
            ystmInvalidReason: 'archived',
            linkedSale: {
              status: 'archived',
              archived_at: '2026-06-01T00:00:00.000Z',
              ends_at: null,
              moderation_status: null,
            },
          },
        },
      ],
      NOW_MS
    )

    expect(mockUpdate).toHaveBeenCalledWith({
      false_exclusion_traced_at: NOW_ISO,
      updated_at: NOW_ISO,
    })
    expect(mockEq).toHaveBeenCalledWith('canonical_url', URL)
  })

  it('persists full bucket bundle when guard does not fire', async () => {
    const { persistFalseExclusionTraces } = await import(
      '@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace'
    )

    const trace = baseTrace({
      secondaryTags: ['catalog_repair_queue'],
      summary: 'sale not in published index',
      evidence: {
        ...baseEvidence,
        ingestedPublishedSaleId: 'sale-1',
      },
    })

    await persistFalseExclusionTraces(
      {} as never,
      [
        {
          trace,
          persistContext: {
            ystmInvalidReason: null,
            linkedSale: {
              status: 'published',
              archived_at: null,
              ends_at: '2026-12-31T00:00:00.000Z',
              moderation_status: null,
            },
          },
        },
      ],
      NOW_MS
    )

    expect(mockUpdate).toHaveBeenCalledWith({
      false_exclusion_primary_bucket: 'published_not_visible',
      false_exclusion_secondary_tags: ['catalog_repair_queue'],
      false_exclusion_summary: 'sale not in published index',
      false_exclusion_evidence: trace.evidence,
      false_exclusion_traced_at: NOW_ISO,
      updated_at: NOW_ISO,
    })
  })
})
