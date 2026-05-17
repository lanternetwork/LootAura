import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockFromBase = vi.hoisted(() => vi.fn())
const mockGetAdminDb = vi.hoisted(() => vi.fn(() => ({})))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: mockGetAdminDb,
  fromBase: mockFromBase,
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

vi.mock('@/lib/ingestion/orchestrationMetrics', () => ({
  fetchLastSuccessfulExternalIngestionAt: vi.fn().mockResolvedValue('2026-05-17T10:00:00.000Z'),
}))

function thenableQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'gte', 'in', 'order', 'limit', 'range']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe('GET /api/admin/ingestion/metrics', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
    mockFromBase.mockImplementation((_admin, table: string) => {
      switch (table) {
        case 'ingested_sales':
          return thenableQuery({
            data: [{ created_at: '2026-05-17T08:00:00.000Z', updated_at: '2026-05-17T08:30:00.000Z' }],
            count: 5,
          })
        case 'ingestion_orchestration_runs':
          return thenableQuery({
            data: [
              {
                created_at: '2026-05-17T11:00:00.000Z',
                mode: 'ingestion',
                duration_ms: 1000,
                batch_size: 25,
                concurrency: 4,
                claimed_count: 3,
                geocode_succeeded_count: 2,
                failed_retriable_count: 0,
                failed_terminal_count: 0,
                publish_attempted_count: 1,
                publish_succeeded_count: 1,
                publish_failed_count: 0,
                publish_expired_count: 0,
                publish_skipped_count: 0,
                rate_429_count: 0,
                notes: {
                  external_ingestion: {
                    status: 'completed',
                    configsCrawlable: 10,
                    pagesProcessed: 4,
                    configsProcessed: 2,
                    fetched: 8,
                    inserted: 1,
                    invalid: 0,
                    errors: 0,
                  },
                },
              },
            ],
          })
        case 'ingestion_orchestration_state':
          return thenableQuery({ data: [{ cursor: 2 }] })
        case 'ingestion_city_configs':
          return thenableQuery({ count: 1 })
        case 'sales':
          return thenableQuery({ count: 0, data: [] })
        case 'ingestion_runs':
          return thenableQuery({ data: [] })
        default:
          return thenableQuery({ data: [], count: 0 })
      }
    })
  })

  it('returns volume metrics shape without raw URLs', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue(undefined)

    const { GET } = await import('@/app/api/admin/ingestion/metrics/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/metrics'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      ok: boolean
      volume: {
        fetch: { crawlableConfigsTotal: number }
        geocode: { needsGeocodeCount: number }
        bottleneck: string
      }
      oldestStuckRows: Array<Record<string, unknown>>
    }
    expect(json.ok).toBe(true)
    expect(json.volume.fetch.crawlableConfigsTotal).toBe(10)
    expect(json.volume.geocode.needsGeocodeCount).toBe(5)
    expect(json.volume.bottleneck).toBeTruthy()
    expect(JSON.stringify(json)).not.toMatch(/https?:\/\//i)
    for (const row of json.oldestStuckRows) {
      expect(row).not.toHaveProperty('source_url')
    }
  })

  it('rejects non-admin callers', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockImplementation(() => {
      throw NextResponse.json({ ok: false }, { status: 403 })
    })
    const { GET } = await import('@/app/api/admin/ingestion/metrics/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/metrics'))
    expect(res.status).toBe(403)
  })
})
