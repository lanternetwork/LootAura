import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())
const mockLoadPublishedIndex = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex', () => ({
  loadLootAuraPublishedYstmIndex: mockLoadPublishedIndex,
}))

const NOW_ISO = '2026-06-21T18:00:00.000Z'
const NOW_MS = Date.parse(NOW_ISO)

const ARCHIVED_INVALIDATION = {
  ystm_valid_active: false,
  ystm_invalid_reason: 'archived',
  discovery_priority: 'cold',
  false_exclusion_primary_bucket: null,
  false_exclusion_secondary_tags: [],
  false_exclusion_evidence: null,
  false_exclusion_summary: null,
  false_exclusion_traced_at: null,
  updated_at: NOW_ISO,
} as const

const EXPIRED_INVALIDATION = {
  ...ARCHIVED_INVALIDATION,
  ystm_invalid_reason: 'expired',
} as const

const COHORT_URL = 'https://www.yardsaletreasuremap.com/sale/archived-1'
const VISIBLE_URL = 'https://www.yardsaletreasuremap.com/sale/visible-1'
const UNMATCHED_URL = 'https://www.yardsaletreasuremap.com/sale/unmatched-1'
const MISMATCH_URL = 'https://www.yardsaletreasuremap.com/sale/mismatch-1'

function observationRow(canonicalUrl: string, overrides: Record<string, unknown> = {}) {
  return {
    canonical_url: canonicalUrl,
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

function setupBackfillMocks(options: {
  cohort: ReturnType<typeof observationRow>[]
  ingestedByUrl?: Record<string, { id: string; source_url: string; status: string; published_sale_id: string | null; sale_instance_key: string | null; is_duplicate: boolean }>
  salesById?: Record<string, { id: string; status: string; archived_at: string | null; ends_at: string | null; moderation_status: string | null }>
  visibleCanonicalUrls?: string[]
  updateResults?: Array<{ error: { message: string } | null }>
}) {
  const {
    cohort,
    ingestedByUrl = {},
    salesById = {},
    visibleCanonicalUrls = [],
    updateResults = [],
  } = options

  mockLoadPublishedIndex.mockResolvedValue({
    visibleCanonicalUrls: new Set(visibleCanonicalUrls),
  })

  let updateCallIndex = 0

  mockFromBase.mockImplementation((_admin, table: string) => {
    if (table === 'ystm_coverage_observations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: vi.fn().mockResolvedValue({ data: cohort, error: null }),
                })),
              })),
            })),
          })),
        })),
        update: vi.fn((payload: unknown) => {
          const result = updateResults[updateCallIndex] ?? { error: null }
          updateCallIndex += 1
          return {
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue(result),
            })),
            _payload: payload,
          }
        }),
      }
    }

    if (table === 'ingested_sales') {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: Object.values(ingestedByUrl),
            error: null,
          }),
        })),
      }
    }

    if (table === 'sales') {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: Object.values(salesById),
            error: null,
          }),
        })),
      }
    }

    throw new Error(`unexpected table ${table}`)
  })
}

describe('backfillPublishedNotVisibleDispositionInvalidation', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
    mockLoadPublishedIndex.mockReset()
  })

  it('invalidates observation with archived linked sale and clears trace fields', async () => {
    const updates: unknown[] = []
    setupBackfillMocks({
      cohort: [
        observationRow(COHORT_URL, { matched_sale_id: 'sale-archived' }),
      ],
      ingestedByUrl: {
        [COHORT_URL]: {
          id: 'ing-1',
          source_url: COHORT_URL,
          status: 'published',
          published_sale_id: 'sale-archived',
          sale_instance_key: 'key-1',
          is_duplicate: false,
        },
      },
      salesById: {
        'sale-archived': {
          id: 'sale-archived',
          status: 'archived',
          archived_at: '2026-01-01T00:00:00.000Z',
          ends_at: '2026-12-31T00:00:00.000Z',
          moderation_status: null,
        },
      },
    })

    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({
                      data: [observationRow(COHORT_URL, { matched_sale_id: 'sale-archived' })],
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            updates.push(payload)
            return {
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              })),
            }
          }),
        }
      }
      if (table === 'ingested_sales') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'ing-1',
                  source_url: COHORT_URL,
                  status: 'published',
                  published_sale_id: 'sale-archived',
                  sale_instance_key: 'key-1',
                  is_duplicate: false,
                },
              ],
              error: null,
            }),
          })),
        }
      }
      if (table === 'sales') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'sale-archived',
                  status: 'archived',
                  archived_at: '2026-01-01T00:00:00.000Z',
                  ends_at: '2026-12-31T00:00:00.000Z',
                  moderation_status: null,
                },
              ],
              error: null,
            }),
          })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillPublishedNotVisibleDispositionInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation'
    )

    const result = await backfillPublishedNotVisibleDispositionInvalidation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ updated: 1, archived: 1, expired: 0 })
    expect(updates).toEqual([ARCHIVED_INVALIDATION])
  })

  it('invalidates observation with expired linked sale', async () => {
    const updates: unknown[] = []
    mockLoadPublishedIndex.mockResolvedValue({ visibleCanonicalUrls: new Set() })

    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({
                      data: [observationRow(COHORT_URL, { matched_sale_id: 'sale-expired' })],
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            updates.push(payload)
            return {
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              })),
            }
          }),
        }
      }
      if (table === 'ingested_sales') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'ing-1',
                  source_url: COHORT_URL,
                  status: 'published',
                  published_sale_id: 'sale-expired',
                  sale_instance_key: null,
                  is_duplicate: false,
                },
              ],
              error: null,
            }),
          })),
        }
      }
      if (table === 'sales') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'sale-expired',
                  status: 'published',
                  archived_at: null,
                  ends_at: '2026-06-17T00:00:00.000Z',
                  moderation_status: null,
                },
              ],
              error: null,
            }),
          })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillPublishedNotVisibleDispositionInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation'
    )

    const result = await backfillPublishedNotVisibleDispositionInvalidation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ updated: 1, archived: 0, expired: 1 })
    expect(updates).toEqual([EXPIRED_INVALIDATION])
  })

  it('does not invalidate visible linked sale', async () => {
    setupBackfillMocks({
      cohort: [observationRow(VISIBLE_URL, { matched_sale_id: 'sale-live' })],
      ingestedByUrl: {
        [VISIBLE_URL]: {
          id: 'ing-visible',
          source_url: VISIBLE_URL,
          status: 'published',
          published_sale_id: 'sale-live',
          sale_instance_key: null,
          is_duplicate: false,
        },
      },
      salesById: {
        'sale-live': {
          id: 'sale-live',
          status: 'published',
          archived_at: null,
          ends_at: '2026-12-31T00:00:00.000Z',
          moderation_status: null,
        },
      },
    })

    const { backfillPublishedNotVisibleDispositionInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation'
    )

    const result = await backfillPublishedNotVisibleDispositionInvalidation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ updated: 0, archived: 0, expired: 0 })
    const obsCalls = mockFromBase.mock.calls.filter(([, table]) => table === 'ystm_coverage_observations')
    const obsClient = obsCalls[0]?.[1] === 'ystm_coverage_observations'
    expect(obsClient || obsCalls.length > 0).toBe(true)
  })

  it('does not invalidate unmatched rows', async () => {
    setupBackfillMocks({
      cohort: [observationRow(UNMATCHED_URL)],
      ingestedByUrl: {},
      salesById: {},
    })

    const { backfillPublishedNotVisibleDispositionInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation'
    )

    const result = await backfillPublishedNotVisibleDispositionInvalidation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ updated: 0, archived: 0, expired: 0 })
  })

  it('does not invalidate identity mismatch when linked sale is not phase4-visible', async () => {
    setupBackfillMocks({
      cohort: [
        observationRow(MISMATCH_URL, {
          matched_sale_id: 'sale-a',
          sale_instance_key: 'key-a',
        }),
      ],
      ingestedByUrl: {
        [MISMATCH_URL]: {
          id: 'ing-mismatch',
          source_url: MISMATCH_URL,
          status: 'published',
          published_sale_id: 'sale-b',
          sale_instance_key: 'key-b',
          is_duplicate: false,
        },
      },
      salesById: {
        'sale-b': {
          id: 'sale-b',
          status: 'needs_check',
          archived_at: null,
          ends_at: null,
          moderation_status: null,
        },
      },
    })

    const { backfillPublishedNotVisibleDispositionInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation'
    )

    const result = await backfillPublishedNotVisibleDispositionInvalidation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ updated: 0, archived: 0, expired: 0 })
  })

  it('returns zero for empty cohort without side effects', async () => {
    setupBackfillMocks({ cohort: [] })

    const { backfillPublishedNotVisibleDispositionInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation'
    )

    const result = await backfillPublishedNotVisibleDispositionInvalidation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ updated: 0, archived: 0, expired: 0 })
    expect(mockFromBase).toHaveBeenCalledTimes(1)
  })

  it('throws on DB update error', async () => {
    setupBackfillMocks({
      cohort: [observationRow(COHORT_URL, { matched_sale_id: 'sale-archived' })],
      ingestedByUrl: {
        [COHORT_URL]: {
          id: 'ing-1',
          source_url: COHORT_URL,
          status: 'published',
          published_sale_id: 'sale-archived',
          sale_instance_key: null,
          is_duplicate: false,
        },
      },
      salesById: {
        'sale-archived': {
          id: 'sale-archived',
          status: 'archived',
          archived_at: '2026-01-01T00:00:00.000Z',
          ends_at: null,
          moderation_status: null,
        },
      },
      updateResults: [{ error: { message: 'timeout' } }],
    })

    const { backfillPublishedNotVisibleDispositionInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleDispositionInvalidation'
    )

    await expect(
      backfillPublishedNotVisibleDispositionInvalidation({} as never, NOW_ISO, NOW_MS)
    ).rejects.toThrow('timeout')
  })
})
