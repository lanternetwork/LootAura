import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAssertAdminOrThrow,
  mockIsCronAuthorized,
  mockAssertCronAuthorized,
  mockScan,
  mockBuild,
  mockReportParserHealth,
} = vi.hoisted(() => ({
  mockAssertAdminOrThrow: vi.fn(),
  mockIsCronAuthorized: vi.fn(),
  mockAssertCronAuthorized: vi.fn(),
  mockScan: vi.fn(),
  mockBuild: vi.fn(),
  mockReportParserHealth: vi.fn(),
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...a: unknown[]) => mockAssertAdminOrThrow(...a),
}))

vi.mock('@/lib/auth/cron', () => ({
  isCronAuthorized: (...a: unknown[]) => mockIsCronAuthorized(...a),
  assertCronAuthorized: (...a: unknown[]) => mockAssertCronAuthorized(...a),
}))

vi.mock('@/lib/parserRegression/parserFixtureScan', () => ({
  scanParserRegressionFixtures: (...a: unknown[]) => mockScan(...a),
}))

vi.mock('@/lib/parserRegression/parserDiagnosticsAggregate', () => ({
  buildParserHealthDiagnosticsPayload: (...a: unknown[]) => mockBuild(...a),
  buildParserHealthAdminApiResponse: (payload: {
    evaluatedAtMs: number
    sources: Array<{
      sourceHost: string
      parserStatus: string
      freshnessStatus: string
      score: number
      reasonList: string[]
      fixtureCount: number
    }>
    summary: { healthy: number; degraded: number; failing: number }
  }) => ({
    ok: true as const,
    evaluatedAtMs: payload.evaluatedAtMs,
    sources: payload.sources.map((s) => ({
      sourceHost: s.sourceHost,
      parserStatus: s.parserStatus,
      freshnessStatus: s.freshnessStatus,
      score: s.score,
      reasons: [...s.reasonList],
      fixtureCount: s.fixtureCount,
    })),
    summary: {
      healthy: payload.summary.healthy,
      degraded: payload.summary.degraded,
      failing: payload.summary.failing,
    },
  }),
}))

vi.mock('@/lib/parserRegression/reportParserHealth', () => ({
  reportParserHealthTransitions: (...a: unknown[]) => mockReportParserHealth(...a),
  resetParserHealthReporterForTests: vi.fn(),
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: { ADMIN_TOOLS: 'ADMIN_TOOLS', ADMIN_HOURLY: 'ADMIN_HOURLY' },
}))

function mockPayload() {
  return {
    evaluatedAtMs: 99,
    sources: [
      {
        sourceHost: 'example.com',
        pageHostHash: 'deadbeef',
        parserStatus: 'healthy' as const,
        healthStatus: 'healthy' as const,
        freshnessStatus: 'fresh' as const,
        score: 100,
        reasonList: [] as string[],
        fixtureCount: 2,
        invalidFixtureCount: 0,
        maxFixtureAgeMs: 0,
      },
    ],
    summary: { healthy: 1, degraded: 0, failing: 0, invalidMetadataCases: 0 },
    invalidFixtureCases: [
      {
        sourceDir: 'x',
        caseId: 'y',
        errors: ['https://evil.example/leak'],
        sourceHostHint: 'example.com',
      },
    ],
    degradation: {
      degradedSources: [],
      failingSources: [],
      recommendedAction: 'none' as const,
      likelySelectorDriftHosts: [],
      likelySourceOutageHosts: [],
      likelyUnsupportedLayoutHosts: [],
      likelyExtractionCollapseHosts: [],
    },
    recommendedAction: 'none' as const,
  }
}

describe('GET /api/admin/parser-health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsCronAuthorized.mockReturnValue(false)
    mockAssertAdminOrThrow.mockResolvedValue({ user: { id: '1', email: 'a@b.com' } })
    mockScan.mockReturnValue({ ok: [], invalid: [] })
    mockBuild.mockReturnValue(mockPayload())
  })

  it('invokes sparse parser health reporting with aggregate snapshots (reasons, no URL fields)', async () => {
    const { GET } = await import('@/app/api/admin/parser-health/route')
    await GET(new NextRequest('http://localhost/api/admin/parser-health'))
    expect(mockReportParserHealth).toHaveBeenCalledTimes(1)
    const arg0 = mockReportParserHealth.mock.calls[0][0] as Array<{
      sourceHost: string
      combinedHealth: string
      reasons: string[]
    }>
    expect(arg0[0]).toMatchObject({
      sourceHost: 'example.com',
      combinedHealth: 'healthy',
    })
    expect(Array.isArray(arg0[0].reasons)).toBe(true)
    expect(mockReportParserHealth.mock.calls[0][2]).toEqual({ reportToSentry: false })
  })

  it('passes reportToSentry when report=1', async () => {
    const { GET } = await import('@/app/api/admin/parser-health/route')
    await GET(new NextRequest('http://localhost/api/admin/parser-health?report=1'))
    expect(mockReportParserHealth.mock.calls[0][2]).toEqual({ reportToSentry: true })
  })

  it('requires admin when not cron', async () => {
    mockAssertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))
    const { GET } = await import('@/app/api/admin/parser-health/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/parser-health'))
    expect(res.status).toBe(403)
  })

  it('returns aggregate shape without raw HTML, URLs, or internal fixture payload fields', async () => {
    const { GET } = await import('@/app/api/admin/parser-health/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/parser-health'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body).toHaveProperty('sources')
    expect(body).toHaveProperty('summary')
    expect(body).not.toHaveProperty('invalidFixtureCases')
    expect(body).not.toHaveProperty('degradation')
    const json = JSON.stringify(body)
    expect(json).not.toMatch(/<html/i)
    expect(json).not.toMatch(/https?:\/\//i)
    expect(json).not.toMatch(/pageHostHash/)
    const sources = body.sources as Array<Record<string, unknown>>
    expect(sources[0]).toMatchObject({
      sourceHost: 'example.com',
      parserStatus: 'healthy',
      freshnessStatus: 'fresh',
      score: 100,
      fixtureCount: 2,
    })
    expect(Array.isArray(sources[0].reasons)).toBe(true)
    expect(body.summary).toEqual({ healthy: 1, degraded: 0, failing: 0 })
  })
})
