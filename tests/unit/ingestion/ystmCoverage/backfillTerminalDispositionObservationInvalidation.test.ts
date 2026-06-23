import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const NOW_ISO = '2026-06-22T19:00:00.000Z'
const URL = 'https://www.yardsaletreasuremap.com/sale/terminal-1'

const TERMINAL_INVALIDATION = {
  ystm_valid_active: false,
  ystm_invalid_reason: 'address_terminal',
  discovery_priority: 'cold',
  false_exclusion_primary_bucket: null,
  false_exclusion_secondary_tags: [],
  false_exclusion_evidence: null,
  false_exclusion_summary: null,
  false_exclusion_traced_at: null,
  updated_at: NOW_ISO,
} as const

describe('backfillTerminalDispositionObservationInvalidation', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
  })

  it('invalidates observation linked to terminal address ingested row', async () => {
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
                        {
                          canonical_url: URL,
                          matched_ingested_sale_id: 'ing-1',
                        },
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
                  source_url: URL,
                  address_status: 'address_terminal_active',
                },
              ],
              error: null,
            }),
          })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillTerminalDispositionObservationInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillTerminalDispositionObservationInvalidation'
    )

    const result = await backfillTerminalDispositionObservationInvalidation({} as never, NOW_ISO)

    expect(result).toEqual({ updated: 1, skipped: 0 })
    expect(updates).toEqual([TERMINAL_INVALIDATION])
  })

  it('skips when linked ingested row is not terminal disposition', async () => {
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({
                      data: [{ canonical_url: URL, matched_ingested_sale_id: null }],
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
      if (table === 'ingested_sales') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'ing-2',
                  source_url: URL,
                  address_status: 'address_gated',
                },
              ],
              error: null,
            }),
          })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillTerminalDispositionObservationInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillTerminalDispositionObservationInvalidation'
    )

    const result = await backfillTerminalDispositionObservationInvalidation({} as never, NOW_ISO)
    expect(result).toEqual({ updated: 0, skipped: 1 })
  })

  it('returns zero for empty cohort', async () => {
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({ data: [], error: null }),
                  })),
                })),
              })),
            })),
          })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { backfillTerminalDispositionObservationInvalidation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillTerminalDispositionObservationInvalidation'
    )

    const result = await backfillTerminalDispositionObservationInvalidation({} as never, NOW_ISO)
    expect(result).toEqual({ updated: 0, skipped: 0 })
    expect(mockFromBase).toHaveBeenCalledTimes(1)
  })
})

describe('resolveTerminalDispositionIngestedRow', () => {
  it('prefers matched_ingested_sale_id over source_url lookup', async () => {
    const { resolveTerminalDispositionIngestedRow } = await import(
      '@/lib/ingestion/ystmCoverage/backfillTerminalDispositionObservationInvalidation'
    )

    const byId = new Map([
      [
        'ing-by-id',
        { id: 'ing-by-id', source_url: 'https://example.com/by-id', address_status: 'address_terminal_active' },
      ],
    ])
    const byUrl = new Map([
      [
        'https://example.com/obs',
        { id: 'ing-by-url', source_url: 'https://example.com/obs', address_status: 'address_gated' },
      ],
    ])

    const resolved = resolveTerminalDispositionIngestedRow(
      { canonical_url: 'https://example.com/obs', matched_ingested_sale_id: 'ing-by-id' },
      byUrl,
      byId
    )

    expect(resolved?.id).toBe('ing-by-id')
  })
})
