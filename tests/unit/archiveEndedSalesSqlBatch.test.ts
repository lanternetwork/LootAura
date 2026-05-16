import { describe, expect, it, vi, beforeEach } from 'vitest'
import { logger } from '@/lib/log'
import { runArchiveEndedSalesJob } from '@/lib/sales/archiveEndedSalesSqlBatch'

const rpcMock = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({ rpc: rpcMock }),
  fromBase: vi.fn(),
}))

describe('runArchiveEndedSalesJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ARCHIVE_SALES_BATCH_SIZE', '250')
    vi.stubEnv('ARCHIVE_SALES_MAX_ITERATIONS', '50')
  })

  it('loops RPC until no rows and aggregates metrics (no in-memory full-table scan)', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    const pendingJson = (a: number, l: number) => ({
      today_utc_date: '2026-01-01',
      pending_via_ends_at: a,
      pending_via_legacy: l,
      published_past_ends_at: a,
      active_past_ends_at: 0,
      suspicious_ends_before_starts: 0,
    })

    let countCalls = 0
    let archiveCalls = 0
    rpcMock.mockImplementation((name: string) => {
      if (name === 'count_sales_pending_archive') {
        countCalls += 1
        if (countCalls === 1) return Promise.resolve({ data: pendingJson(2, 1), error: null })
        return Promise.resolve({ data: pendingJson(0, 0), error: null })
      }
      if (name === 'archive_sales_ended_batch') {
        archiveCalls += 1
        if (archiveCalls === 1) {
          return Promise.resolve({ data: { archived_via_ends_at: 2, archived_via_legacy: 1 }, error: null })
        }
        return Promise.resolve({ data: { archived_via_ends_at: 0, archived_via_legacy: 0 }, error: null })
      }
      return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) })
    })

    const admin = { rpc: rpcMock } as any
    const out = await runArchiveEndedSalesJob({
      admin,
      now: new Date('2026-01-15T12:00:00.000Z'),
      logBase: { task: 'archive-sales', requestId: 'test-req' },
    })

    expect(out.ok).toBe(true)
    expect(out.archived).toBe(3)
    expect(out.archived_via_ends_at).toBe(2)
    expect(out.archived_via_legacy_fallback).toBe(1)
    expect(out.batches_run).toBe(2)
    expect(out.errors).toBe(0)
    expect(rpcMock.mock.calls.filter((c) => c[0] === 'archive_sales_ended_batch').length).toBe(2)

    const summary = infoSpy.mock.calls.find((c) => c[0] === 'archive_sales_job_summary')?.[1] as Record<
      string,
      unknown
    >
    expect(summary).toMatchObject({
      archived: 3,
      archived_via_ends_at: 2,
      archived_via_legacy_fallback: 1,
      batches_run: 2,
    })
    expect(infoSpy.mock.calls.some((c) => c[0] === 'archive_sales_used_legacy_fallback')).toBe(true)
    infoSpy.mockRestore()
  })

  it('parses RPC row shape when PostgREST returns an array row', async () => {
    let countCalls = 0
    rpcMock.mockImplementation((name: string) => {
      if (name === 'count_sales_pending_archive') {
        countCalls += 1
        return Promise.resolve({
          data: {
            today_utc_date: '2026-01-01',
            pending_via_ends_at: 0,
            pending_via_legacy: 0,
            published_past_ends_at: 0,
            active_past_ends_at: 0,
            suspicious_ends_before_starts: 0,
          },
          error: null,
        })
      }
      if (name === 'archive_sales_ended_batch') {
        return Promise.resolve({
          data: [{ archived_via_ends_at: 0, archived_via_legacy: 0 }],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const out = await runArchiveEndedSalesJob({
      admin: { rpc: rpcMock } as any,
      logBase: {},
    })
    expect(out.archived).toBe(0)
    expect(countCalls).toBe(2)
  })
})
