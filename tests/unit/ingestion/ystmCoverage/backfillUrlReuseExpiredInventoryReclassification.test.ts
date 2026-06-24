import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const NOW_ISO = '2026-06-24T10:00:00.000Z'
const URL =
  'https://yardsaletreasuremap.com/US/Texas/Austin/100-Main-St/1/listing.html'

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    hasIngestedRow: true,
    ingestedStatus: 'expired',
    ingestedPublishedSaleId: null,
    isDuplicate: false,
    addressStatus: 'address_terminal_archived',
    configEnabled: true,
    configHasSourcePages: true,
    configCrawlExcluded: false,
    configLastCrawlAt: '2026-06-24T08:00:00Z',
    missingIngestionOutcome: 'skipped_existing',
    missingIngestionFailureReason: null,
    visibleInPublishedIndex: false,
    catalogRepairEligible: false,
    sourceListingId: '1',
    saleInstanceKey: 'external_page_source:TX|austin|addr:2026-06-20|2026-06-21:1',
    ...overrides,
  }
}

function observationRow(overrides: Record<string, unknown> = {}) {
  return {
    canonical_url: URL,
    false_exclusion_evidence: evidence(),
    ...overrides,
  }
}

describe('backfillUrlReuseExpiredInventoryReclassification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reclassifies terminal archived expired skipped_existing rows', async () => {
    const updates: unknown[] = []
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({
                      data: [observationRow()],
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
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  })),
                })),
              })),
            }
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillUrlReuseExpiredInventoryReclassification } = await import(
      '@/lib/ingestion/ystmCoverage/backfillUrlReuseExpiredInventoryReclassification'
    )

    const result = await backfillUrlReuseExpiredInventoryReclassification(
      {} as never,
      NOW_ISO
    )

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      terminalDispositionUpdated: 1,
      expiredFalsePositiveUpdated: 0,
    })
    expect(updates[0]).toMatchObject({
      false_exclusion_primary_bucket: 'terminal_disposition',
      updated_at: NOW_ISO,
    })
  })

  it('reclassifies address_available expired skipped_existing to expired_false_positive', async () => {
    const updates: unknown[] = []
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({
                      data: [
                        observationRow({
                          false_exclusion_evidence: evidence({
                            addressStatus: 'address_available',
                          }),
                        }),
                      ],
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
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  })),
                })),
              })),
            }
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillUrlReuseExpiredInventoryReclassification } = await import(
      '@/lib/ingestion/ystmCoverage/backfillUrlReuseExpiredInventoryReclassification'
    )

    const result = await backfillUrlReuseExpiredInventoryReclassification(
      {} as never,
      NOW_ISO
    )

    expect(result).toEqual({
      scanned: 1,
      updated: 1,
      terminalDispositionUpdated: 0,
      expiredFalsePositiveUpdated: 1,
    })
    expect(updates[0]).toMatchObject({
      false_exclusion_primary_bucket: 'expired_false_positive',
    })
  })

  it('skips rows without skipped_existing outcome', async () => {
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({
                      data: [
                        observationRow({
                          false_exclusion_evidence: evidence({
                            missingIngestionOutcome: null,
                          }),
                        }),
                      ],
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillUrlReuseExpiredInventoryReclassification } = await import(
      '@/lib/ingestion/ystmCoverage/backfillUrlReuseExpiredInventoryReclassification'
    )

    const result = await backfillUrlReuseExpiredInventoryReclassification(
      {} as never,
      NOW_ISO
    )

    expect(result.updated).toBe(0)
  })
})
