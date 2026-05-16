import { describe, expect, it, vi, beforeEach } from 'vitest'
import { runBackfillSaleListingEnds } from '@/lib/sales/backfillSaleListingEndsAt'
import type { DiagnoseSaleListingEndsResult } from '@/lib/sales/resolvePersistableSaleEndsAt'

const diagnoseMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/sales/resolvePersistableSaleEndsAt', () => ({
  diagnoseSaleListingEnds: (...args: unknown[]) => diagnoseMock(...args),
  resolvePersistableSaleEndsAt: vi.fn(),
}))

const updateEq = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: updateEq }))

type BackfillSaleRow = {
  id: string
  date_start: string
  time_start: string | null
  date_end: string | null
  time_end: string | null
  zip_code: string | null
  state: string | null
  lat: number
  lng: number
  ends_at: string | null
  listing_timezone: string | null
}

const selectLimit = vi.fn(() =>
  Promise.resolve({ data: [] as BackfillSaleRow[], error: null as null })
)

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: vi.fn((_db: unknown, table: string) => {
    if (table !== 'sales') throw new Error(`unexpected table ${table}`)
    return {
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: selectLimit,
          })),
        })),
      })),
      update: updateMock,
    }
  }),
}))

describe('runBackfillSaleListingEnds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    diagnoseMock.mockReset()
    selectLimit.mockReset()
    selectLimit.mockImplementation(() => Promise.resolve({ data: [], error: null }))
    updateMock.mockImplementation(() => ({ eq: updateEq }))
    updateEq.mockImplementation(() => Promise.resolve({ error: null }))
  })

  it('is idempotent when diagnosis matches persisted values (no update calls)', async () => {
    const row = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      date_start: '2026-06-15',
      time_start: '09:00:00',
      date_end: null,
      time_end: '12:00:00',
      zip_code: '60601',
      state: 'IL',
      lat: 41.8,
      lng: -87.6,
      ends_at: '2026-06-15T17:00:00.000Z',
      listing_timezone: 'America/Chicago',
    }
    selectLimit.mockResolvedValueOnce({ data: [row], error: null })
    diagnoseMock.mockResolvedValueOnce({
      outcome: 'ok',
      ends_at: '2026-06-15T17:00:00.000Z',
      listing_timezone: 'America/Chicago',
      timezone_source: 'zip5',
    } satisfies DiagnoseSaleListingEndsResult)

    const m = await runBackfillSaleListingEnds({ dryRun: false, batchSize: 10, maxRows: 100 })

    expect(m.processed).toBe(1)
    expect(m.skipped).toBe(1)
    expect(m.updated).toBe(0)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('applies updates when diagnosis differs from persisted row', async () => {
    const row = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      date_start: '2026-06-15',
      time_start: '09:00:00',
      date_end: null,
      time_end: '12:00:00',
      zip_code: '60601',
      state: 'IL',
      lat: 41.8,
      lng: -87.6,
      ends_at: null,
      listing_timezone: null,
    }
    selectLimit.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: [], error: null })
    diagnoseMock.mockResolvedValue({
      outcome: 'ok',
      ends_at: '2026-06-15T17:00:00.000Z',
      listing_timezone: 'America/Chicago',
      timezone_source: 'zip5',
    } satisfies DiagnoseSaleListingEndsResult)

    const m = await runBackfillSaleListingEnds({ dryRun: false, batchSize: 10, maxRows: 100 })

    expect(m.updated).toBe(1)
    expect(updateMock).toHaveBeenCalled()
    expect(updateEq).toHaveBeenCalledWith('id', row.id)
  })

  it('dry-run increments dry_run_planned_updates and performs no updates', async () => {
    const row = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      date_start: '2026-06-15',
      time_start: '09:00:00',
      date_end: null,
      time_end: '12:00:00',
      zip_code: '60601',
      state: 'IL',
      lat: 41.8,
      lng: -87.6,
      ends_at: null,
      listing_timezone: null,
    }
    selectLimit.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: [], error: null })
    diagnoseMock.mockResolvedValue({
      outcome: 'ok',
      ends_at: '2026-06-15T17:00:00.000Z',
      listing_timezone: 'America/Chicago',
      timezone_source: 'zip5',
    } satisfies DiagnoseSaleListingEndsResult)

    const m = await runBackfillSaleListingEnds({ dryRun: true, batchSize: 10, maxRows: 100 })

    expect(m.dry_run_planned_updates).toBe(1)
    expect(m.updated).toBe(0)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
