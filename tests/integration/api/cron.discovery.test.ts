import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockRun = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ok: true,
    skipped: false,
    telemetry: {
      statesScanned: 2,
      stateCursorBefore: 0,
      stateCursorAfter: 2,
      catalogSize: 51,
      candidatePagesDiscovered: 10,
      candidatePagesValid: 8,
      candidatePagesInvalid: 2,
      configsPromoted: 1,
      configsRepaired: 0,
      configsRevalidated: 2,
      configsFailed: 0,
      placeholdersUnresolved: 0,
      crawlableConfigCount: 100,
      failedConfigCount: 5,
      crawlExcludedConfigCount: 3,
      discoveryLatencyMs: 1200,
      repairRate: 0,
      overlapPrevented: false,
      staleLockRecovered: false,
      degraded: false,
      phasesCompleted: ['discover', 'promote', 'revalidate'],
    },
  })
)

vi.mock('@/lib/ingestion/discovery/runSourceDiscoveryCron', () => ({
  runSourceDiscoveryCron: mockRun,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
}))

vi.mock('@/lib/ingestion/orchestrationMetrics', () => ({
  recordDiscoveryCronOrchestrationRun: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
  isCronAuthorized: vi.fn(() => true),
}))

describe('/api/cron/discovery', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRun.mockClear()
  })

  it('rejects when cron auth fails', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {
      throw NextResponse.json({ ok: false }, { status: 401 })
    })
    const { GET } = await import('@/app/api/cron/discovery/route')
    const res = await GET(new NextRequest('http://localhost/api/cron/discovery'))
    expect(res.status).toBe(401)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('returns aggregate JSON without raw URLs', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    const { GET } = await import('@/app/api/cron/discovery/route')
    const res = await GET(new NextRequest('http://localhost/api/cron/discovery'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(true)
    expect(json.job).toBe('discovery_cron')
    expect(json.crawlableConfigCount).toBe(100)
    expect(JSON.stringify(json)).not.toContain('yardsaletreasuremap.com')
    expect(mockRun).toHaveBeenCalledTimes(1)
  })
})
