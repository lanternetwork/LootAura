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

function thenableQuery(result: { data?: unknown; error?: unknown }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'order', 'limit', 'range']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe('GET /api/admin/ingestion/ystm-coverage', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
    mockFromBase.mockImplementation((_admin, table: string) => {
      switch (table) {
        case 'ystm_coverage_observations':
          return thenableQuery({ data: [] })
        case 'ystm_coverage_audit_runs':
          return thenableQuery({ data: [] })
        case 'sales':
          return thenableQuery({
            data: [
              {
                external_source_url:
                  'https://yardsaletreasuremap.com/US/IL/Springfield/1/listing.html',
                lat: 39.78,
                lng: -89.65,
              },
            ],
          })
        case 'ingestion_city_configs':
          return thenableQuery({
            data: [
              {
                city: 'Springfield',
                state: 'IL',
                source_platform: 'external_page_source',
                source_pages: ['https://yardsaletreasuremap.com/US/Illinois/Springfield/Springfield.html'],
                source_crawl_excluded_at: null,
                source_discovery_status: 'validated',
              },
            ],
          })
        case 'ingested_sales':
          return thenableQuery({ data: [] })
        default:
          return thenableQuery({ data: [] })
      }
    })
  })

  it('returns scoreboard with zero audit footprint and published total', async () => {
    const { GET } = await import('@/app/api/admin/ingestion/ystm-coverage/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/ystm-coverage'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.targetPct).toBe(90)
    expect(json.publishedActiveLootAuraYstmUrls).toBe(1)
    expect(json.validActiveYstmUrls).toBe(0)
    expect(json.coveragePct).toBeNull()
    expect(json.sourceExpansion.crawlableConfigs).toBe(1)
    expect(json.sourceExpansion.configsWithoutSourcePages).toBe(0)
    expect(json.missingIngestion.missingQueueTotal).toBe(0)
    expect(json.missingIngestion.missingIngestionNeverAttempted).toBe(0)
    expect(json.existingRefresh.ystmDetailIngestedTotal).toBe(0)
    expect(json.existingRefresh.neverSynced).toBe(0)
    expect(json.catalogRepair.repairQueueTotal).toBe(0)
    expect(json.catalogRepair.needsGeocode).toBe(0)
    expect(json.pipelineBacklog.missingValidUrls).toBe(0)
    expect(json.operationalHealth.alerts.some((a: { code: string }) => a.code === 'coverage_no_audit_denominator')).toBe(
      true
    )
  })
})
