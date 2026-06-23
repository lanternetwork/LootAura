import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const NOW_ISO = '2026-06-23T09:00:00.000Z'
const NOW_MS = Date.parse(NOW_ISO)
const URL = 'https://www.yardsaletreasuremap.com/129139822/listing.html'
const SALE_ID = 'ce6df386-71ab-40e0-8c90-8e04a78ad3ca'

const RECONCILIATION_FIELDS = {
  lootaura_visible: true,
  false_exclusion_primary_bucket: null,
  false_exclusion_secondary_tags: [],
  false_exclusion_evidence: null,
  false_exclusion_summary: null,
  false_exclusion_traced_at: null,
  updated_at: NOW_ISO,
} as const

const PUBLISHED_SALE = {
  id: SALE_ID,
  status: 'published',
  archived_at: null,
  ends_at: '2027-01-01T00:00:00.000Z',
  moderation_status: null,
}

const ARCHIVED_SALE = {
  id: SALE_ID,
  status: 'archived',
  archived_at: '2026-06-01T00:00:00.000Z',
  ends_at: null,
  moderation_status: null,
}

function observationRow(overrides: Record<string, unknown> = {}) {
  return {
    canonical_url: URL,
    matched_sale_id: SALE_ID,
    matched_ingested_sale_id: null,
    ...overrides,
  }
}

function setupBackfillMocks(options: {
  cohort: ReturnType<typeof observationRow>[]
  ingestedByUrl?: Record<string, { id: string; source_url: string; status: string; published_sale_id: string | null; sale_instance_key: string | null; is_duplicate: boolean }>
  ingestedById?: Record<string, { id: string; source_url: string; status: string; published_sale_id: string | null; sale_instance_key: string | null; is_duplicate: boolean }>
  salesById?: Record<string, typeof PUBLISHED_SALE>
  updateResults?: Array<{ error: { message: string } | null }>
}) {
  const {
    cohort,
    ingestedByUrl = {},
    ingestedById = {},
    salesById = {},
    updateResults = [],
  } = options

  const updates: unknown[] = []
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
          updates.push(payload)
          const result = updateResults[updateCallIndex] ?? { error: null }
          updateCallIndex += 1
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue(result),
              })),
            })),
          }
        }),
      }
    }
    if (table === 'ingested_sales') {
      return {
        select: vi.fn(() => ({
          in: vi.fn((column: string) => {
            if (column === 'source_url') {
              return Promise.resolve({
                data: Object.values(ingestedByUrl),
                error: null,
              })
            }
            return Promise.resolve({
              data: Object.values(ingestedById),
              error: null,
            })
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

  return { updates }
}

describe('backfillCoverageVisibilityReconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
  })

  it('reconciles stale observation with linked published sale passing Phase 4', async () => {
    const { updates } = setupBackfillMocks({
      cohort: [observationRow()],
      salesById: { [SALE_ID]: PUBLISHED_SALE },
    })

    const { backfillCoverageVisibilityReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    const result = await backfillCoverageVisibilityReconciliation({} as never, NOW_ISO, NOW_MS)

    expect(result).toEqual({ scanned: 1, updated: 1 })
    expect(updates).toEqual([RECONCILIATION_FIELDS])
  })

  it('resolves linked sale via matched_ingested_sale_id and published_sale_id', async () => {
    const { updates } = setupBackfillMocks({
      cohort: [
        observationRow({
          matched_sale_id: null,
          matched_ingested_sale_id: 'ing-1',
        }),
      ],
      ingestedById: {
        'ing-1': {
          id: 'ing-1',
          source_url: URL,
          status: 'published',
          published_sale_id: SALE_ID,
          sale_instance_key: null,
          is_duplicate: false,
        },
      },
      salesById: { [SALE_ID]: PUBLISHED_SALE },
    })

    const { backfillCoverageVisibilityReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    const result = await backfillCoverageVisibilityReconciliation({} as never, NOW_ISO, NOW_MS)

    expect(result).toEqual({ scanned: 1, updated: 1 })
    expect(updates).toEqual([RECONCILIATION_FIELDS])
  })

  it('skips when linked sale fails Phase 4', async () => {
    const { updates } = setupBackfillMocks({
      cohort: [observationRow()],
      salesById: { [SALE_ID]: ARCHIVED_SALE },
    })

    const { backfillCoverageVisibilityReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    const result = await backfillCoverageVisibilityReconciliation({} as never, NOW_ISO, NOW_MS)

    expect(result).toEqual({ scanned: 1, updated: 0 })
    expect(updates).toEqual([])
  })

  it('skips when linked sale is missing', async () => {
    const { updates } = setupBackfillMocks({
      cohort: [
        observationRow({
          matched_sale_id: null,
          matched_ingested_sale_id: null,
        }),
      ],
    })

    const { backfillCoverageVisibilityReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    const result = await backfillCoverageVisibilityReconciliation({} as never, NOW_ISO, NOW_MS)

    expect(result).toEqual({ scanned: 1, updated: 0 })
    expect(updates).toEqual([])
  })

  it('returns zero for empty cohort', async () => {
    setupBackfillMocks({ cohort: [] })

    const { backfillCoverageVisibilityReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    const result = await backfillCoverageVisibilityReconciliation({} as never, NOW_ISO, NOW_MS)

    expect(result).toEqual({ scanned: 0, updated: 0 })
  })
})

describe('resolveCoverageVisibilityIngestedRow', () => {
  it('prefers matched_ingested_sale_id over source_url lookup', async () => {
    const { resolveCoverageVisibilityIngestedRow } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    const byId = new Map([
      [
        'ing-by-id',
        {
          id: 'ing-by-id',
          source_url: 'https://example.com/by-id',
          status: 'published',
          published_sale_id: SALE_ID,
          sale_instance_key: null,
          is_duplicate: false,
        },
      ],
    ])
    const byUrl = new Map([
      [
        URL,
        {
          id: 'ing-by-url',
          source_url: URL,
          status: 'published',
          published_sale_id: 'other-sale',
          sale_instance_key: null,
          is_duplicate: false,
        },
      ],
    ])

    const resolved = resolveCoverageVisibilityIngestedRow(
      { canonical_url: URL, matched_ingested_sale_id: 'ing-by-id' },
      byUrl,
      byId
    )

    expect(resolved?.id).toBe('ing-by-id')
  })
})

describe('resolveCoverageVisibilityLinkedSaleId', () => {
  it('prefers matched_sale_id over ingested published_sale_id', async () => {
    const { resolveCoverageVisibilityLinkedSaleId } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    const saleId = resolveCoverageVisibilityLinkedSaleId(
      { matched_sale_id: 'direct-sale' },
      {
        id: 'ing-1',
        source_url: URL,
        status: 'published',
        published_sale_id: 'ingested-sale',
        sale_instance_key: null,
        is_duplicate: false,
      }
    )

    expect(saleId).toBe('direct-sale')
  })
})

describe('coverage visibility reconciliation integration cohort', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
  })

  it('keeps ystm_valid_active unchanged (reconciliation fields only)', async () => {
    const { updates } = setupBackfillMocks({
      cohort: [observationRow()],
      salesById: { [SALE_ID]: PUBLISHED_SALE },
    })

    const { backfillCoverageVisibilityReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillCoverageVisibilityReconciliation'
    )

    await backfillCoverageVisibilityReconciliation({} as never, NOW_ISO, NOW_MS)

    expect(updates[0]).not.toHaveProperty('ystm_valid_active')
    expect(updates[0]).not.toHaveProperty('ystm_invalid_reason')
    expect((updates[0] as { lootaura_visible: boolean }).lootaura_visible).toBe(true)
  })
})
