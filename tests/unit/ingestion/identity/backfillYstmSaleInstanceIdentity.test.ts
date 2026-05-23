import { describe, expect, it, vi } from 'vitest'
import {
  assessYstmBackfillRowQuality,
  runBackfillYstmSaleInstanceIdentity,
} from '@/lib/ingestion/identity/backfillYstmSaleInstanceIdentity'

const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/ingestion/identity/recordIngestedSaleSourceUrl', () => ({
  recordIngestedSaleSourceUrl: vi.fn().mockResolvedValue(undefined),
}))

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row-1',
    source_url: DETAIL_URL,
    source_platform: 'external_page_source',
    state: 'IL',
    city: 'Chicago',
    normalized_address: '4443 s st louis ave',
    date_start: '2026-06-01',
    date_end: '2026-06-02',
    time_start: null,
    time_end: null,
    title: 'Garage sale',
    description: 'Stuff',
    lat: 41.81,
    lng: -87.71,
    raw_payload: {},
    superseded_by_ingested_sale_id: null,
    sale_instance_key: null,
    ...overrides,
  }
}

describe('assessYstmBackfillRowQuality', () => {
  it('flags missing date and location', () => {
    expect(
      assessYstmBackfillRowQuality(
        makeRow({ date_start: null, date_end: null, normalized_address: null }) as never
      )
    ).toEqual({ missingDate: true, missingLocation: true })
  })
})

describe('runBackfillYstmSaleInstanceIdentity', () => {
  it('dry-run computes identity without writing', async () => {
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                not: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [makeRow()], error: null })),
                  })),
                })),
              })),
            })),
          })),
        }
      }
      return {}
    })

    const metrics = await runBackfillYstmSaleInstanceIdentity({
      dryRun: true,
      batchSize: 10,
      maxRows: 5,
    })

    expect(metrics.rowsBackfilled).toBe(1)
    expect(metrics.aliasesRecorded).toBe(1)
    expect(metrics.dryRun).toBe(true)
    expect(metrics.keyCollisions).toBe(0)
  })

  it('skips rows when an active sale_instance_key is already owned', async () => {
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: vi.fn((cols: string) => {
            if (cols === 'id') {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      neq: vi.fn(() => ({
                        limit: vi.fn(() => ({
                          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'other-row' }, error: null }),
                        })),
                      })),
                    })),
                  })),
                })),
              }
            }
            return {
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  not: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(async () => ({ data: [makeRow()], error: null })),
                    })),
                  })),
                })),
              })),
            }
          }),
        }
      }
      return {}
    })

    const metrics = await runBackfillYstmSaleInstanceIdentity({
      dryRun: true,
      batchSize: 10,
      maxRows: 5,
    })

    expect(metrics.keyCollisions).toBe(1)
    expect(metrics.ambiguousRows).toBe(1)
    expect(metrics.rowsBackfilled).toBe(0)
  })
})
