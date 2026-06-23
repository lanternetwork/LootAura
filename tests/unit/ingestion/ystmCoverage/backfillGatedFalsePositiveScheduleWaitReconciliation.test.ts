import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const NOW_ISO = '2026-06-06T12:00:00.000Z'
const NOW_MS = Date.parse(NOW_ISO)
const UNLOCK_URL =
  'https://yardsaletreasuremap.com/US/Texas/Austin/See-source-for-address-after-2026-06-06-14%3A00%3A00/1/listing.html'

const RECONCILIATION_FIELDS = {
  false_exclusion_primary_bucket: 'schedule_wait',
  false_exclusion_secondary_tags: [],
  false_exclusion_evidence: null,
  false_exclusion_summary: null,
  false_exclusion_traced_at: null,
  updated_at: NOW_ISO,
} as const

function observationRow(overrides: Record<string, unknown> = {}) {
  return {
    canonical_url: UNLOCK_URL,
    matched_ingested_sale_id: null,
    ...overrides,
  }
}

function scheduleWaitIngested(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ing-1',
    source_url: UNLOCK_URL,
    address_status: 'address_gated',
    address_enrichment_attempts: 1,
    next_enrichment_attempt_at: null,
    address_unlock_at: '2026-06-06T13:00:00.000Z',
    last_address_enrichment_attempt_at: null,
    published_sale_id: null,
    is_duplicate: false,
    ...overrides,
  }
}

function setupBackfillMocks(options: {
  cohort: ReturnType<typeof observationRow>[]
  ingestedByUrl?: Record<string, ReturnType<typeof scheduleWaitIngested>>
  ingestedById?: Record<string, ReturnType<typeof scheduleWaitIngested>>
  updateResults?: Array<{ error: { message: string } | null }>
}) {
  const {
    cohort,
    ingestedByUrl = {},
    ingestedById = {},
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
                eq: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue(result),
                })),
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
    throw new Error(`unexpected table ${table}`)
  })

  return { updates }
}

describe('backfillGatedFalsePositiveScheduleWaitReconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
  })

  it('re-buckets eligible gated_false_positive rows to schedule_wait', async () => {
    const { updates } = setupBackfillMocks({
      cohort: [observationRow()],
      ingestedByUrl: { [UNLOCK_URL]: scheduleWaitIngested() },
    })

    const { backfillGatedFalsePositiveScheduleWaitReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillGatedFalsePositiveScheduleWaitReconciliation'
    )

    const result = await backfillGatedFalsePositiveScheduleWaitReconciliation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ scanned: 1, updated: 1 })
    expect(updates).toEqual([RECONCILIATION_FIELDS])
  })

  it('skips when linked ingested row is not an expected schedule wait', async () => {
    const { updates } = setupBackfillMocks({
      cohort: [observationRow()],
      ingestedByUrl: {
        [UNLOCK_URL]: scheduleWaitIngested({
          address_unlock_at: '2026-06-06T10:00:00.000Z',
        }),
      },
    })

    const { backfillGatedFalsePositiveScheduleWaitReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillGatedFalsePositiveScheduleWaitReconciliation'
    )

    const result = await backfillGatedFalsePositiveScheduleWaitReconciliation(
      {} as never,
      NOW_ISO,
      Date.parse('2026-06-06T15:00:00.000Z')
    )

    expect(result).toEqual({ scanned: 1, updated: 0 })
    expect(updates).toEqual([])
  })

  it('resolves ingested row via matched_ingested_sale_id', async () => {
    const ingested = scheduleWaitIngested({ id: 'ing-linked' })
    const { updates } = setupBackfillMocks({
      cohort: [observationRow({ matched_ingested_sale_id: 'ing-linked' })],
      ingestedById: { 'ing-linked': ingested },
    })

    const { backfillGatedFalsePositiveScheduleWaitReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillGatedFalsePositiveScheduleWaitReconciliation'
    )

    const result = await backfillGatedFalsePositiveScheduleWaitReconciliation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )

    expect(result).toEqual({ scanned: 1, updated: 1 })
    expect(updates).toEqual([RECONCILIATION_FIELDS])
  })
})

describe('resolveScheduleWaitReconciliationIngestedRow', () => {
  it('prefers matched ingested id over url lookup', async () => {
    const { resolveScheduleWaitReconciliationIngestedRow } = await import(
      '@/lib/ingestion/ystmCoverage/backfillGatedFalsePositiveScheduleWaitReconciliation'
    )

    const byId = scheduleWaitIngested({ id: 'by-id' })
    const byUrl = scheduleWaitIngested({ id: 'by-url' })

    expect(
      resolveScheduleWaitReconciliationIngestedRow(
        { canonical_url: UNLOCK_URL, matched_ingested_sale_id: 'by-id' },
        new Map([[UNLOCK_URL, byUrl]]),
        new Map([['by-id', byId]])
      )
    ).toEqual(byId)
  })
})
