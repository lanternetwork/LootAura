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
  fetchLastSuccessfulExternalIngestionAt: vi.fn().mockImplementation(async () =>
    new Date(Date.now() - 60 * 60 * 1000).toISOString()
  ),
}))

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function thenableQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const q: Record<string, unknown> = {}
  const maybeSingleResult = {
    data: Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null),
    error: result.error ?? null,
  }
  for (const m of [
    'select',
    'eq',
    'neq',
    'not',
    'gte',
    'lt',
    'in',
    'is',
    'or',
    'ilike',
    'order',
    'limit',
    'range',
  ]) {
    q[m] = vi.fn(() => q)
  }
  q.maybeSingle = vi.fn(() => Promise.resolve(maybeSingleResult))
  q.then = (onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe('GET /api/admin/ingestion/metrics', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
    mockFromBase.mockImplementation((_admin, table: string) => {
      const recentCreatedAt = hoursAgoIso(2)
      const recentUpdatedAt = hoursAgoIso(1)
      switch (table) {
        case 'ingested_sales':
          return thenableQuery({
            data: [{ created_at: recentCreatedAt, updated_at: recentUpdatedAt }],
            count: 5,
          })
        case 'ingestion_orchestration_runs':
          return thenableQuery({
            data: [
              {
                created_at: recentCreatedAt,
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
                    skipped: 7,
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
          return thenableQuery({
            data: [
              {
                city: 'Louisville',
                state: 'KY',
                source_platform: 'external_page_source',
                source_pages: ['https://yardsaletreasuremap.com/kentucky/louisville.html'],
                source_discovery_status: 'validated',
                source_crawl_window_fetched: 10,
                source_crawl_window_skipped: 2,
                source_crawl_window_inserted: 1,
                source_crawl_last_at: recentUpdatedAt,
                source_crawl_last_insert_at: recentCreatedAt,
              },
            ],
            count: 1,
          })
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
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-test' } })

    const { GET } = await import('@/app/api/admin/ingestion/metrics/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/metrics'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      ok: boolean
      detailFirstMetricsBaselineAt: string | null
      detailFirstProof: { status: string; passed: boolean; checks: unknown[] }
      geocodeEligibleBacklog: number
      funnel: {
        '24h': { stages: Array<{ id: string; count: number }>; reconciliation: { crawlerReconciles: boolean } }
      }
      volume: {
        addressLifecycle: { enrichmentBacklog: number; byStatus: Record<string, number> }
        imageEnrichment: { backlog: number; hasImage: number }
        acquisition: { crawlableConfigs: number; saturatedConfigs: number }
        fetch: { crawlableConfigsTotal: number; insertYield24h: number | null }
        geocode: { needsGeocodeCount: number; eligibleNeedsGeocodeCount: number }
        bottleneck: string
      }
      oldestStuckRows: Array<Record<string, unknown>>
    }
    expect(json.ok).toBe(true)
    expect(json.detailFirstMetricsBaselineAt).toBeNull()
    expect(json.detailFirstProof.status).toBe('pending_baseline')
    expect(json.detailFirstProof.passed).toBe(false)
    expect(json.detailFirstProof.checks.length).toBeGreaterThan(0)
    expect(json.funnel['24h'].stages.length).toBeGreaterThan(0)
    expect(json.funnel['24h'].reconciliation.crawlerReconciles).toBe(true)
    expect(json.volume.fetch.crawlableConfigsTotal).toBe(10)
    expect(json.volume.acquisition.crawlableConfigs).toBe(1)
    expect(json.volume.fetch.insertYield24h).toBe(0.125)
    expect(json.volume.geocode.needsGeocodeCount).toBe(5)
    expect(json.volume.addressLifecycle.enrichmentBacklog).toBe(5)
    expect(json.volume.imageEnrichment.backlog).toBe(5)
    expect(json.volume.geocode.eligibleNeedsGeocodeCount).toBe(5)
    expect(json.geocodeEligibleBacklog).toBe(5)
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
