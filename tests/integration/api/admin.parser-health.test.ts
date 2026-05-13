import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockAssertAdminOrThrow = vi.fn()
const mockIsCronAuthorized = vi.fn()
const mockAssertCronAuthorized = vi.fn()

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: unknown[]) => mockAssertAdminOrThrow(...args),
}))

vi.mock('@/lib/auth/cron', () => ({
  isCronAuthorized: (...args: unknown[]) => mockIsCronAuthorized(...args),
  assertCronAuthorized: (...args: unknown[]) => mockAssertCronAuthorized(...args),
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: {
    ADMIN_TOOLS: 'ADMIN_TOOLS',
    ADMIN_HOURLY: 'ADMIN_HOURLY',
  },
}))

const mockReportTransition = vi.fn()

vi.mock('@/lib/parserRegression/reportParserHealth', () => ({
  reportParserHealthTransition: (...args: unknown[]) => mockReportTransition(...args),
  resetParserHealthReporterForTests: vi.fn(),
}))

vi.mock('@/lib/parserRegression/parserRegressionHarness', () => ({
  parserRegressionPackageRoot: vi.fn(() => '/tmp/parser-root'),
}))

const mockBuild = vi.fn()
vi.mock('@/lib/parserRegression/buildParserDiagnostics', () => ({
  buildParserDiagnosticsFromFixtures: (...args: unknown[]) => mockBuild(...args),
}))

describe('GET /api/admin/parser-health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsCronAuthorized.mockReturnValue(false)
    mockAssertAdminOrThrow.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com' },
    })
    mockBuild.mockReturnValue({
      sources: [],
      summary: { healthy: 0, degraded: 0, failing: 0 },
      degradedSources: [],
      failingSources: [],
      recommendedAction: 'monitor_parser_regression_pass_rate',
    })
  })

  it('requires admin when not cron', async () => {
    mockAssertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))
    const { GET } = await import('@/app/api/admin/parser-health/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/parser-health'))
    expect(res.status).toBe(403)
  })

  it('returns aggregate diagnostics JSON', async () => {
    const { GET } = await import('@/app/api/admin/parser-health/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/parser-health'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.summary).toEqual({ healthy: 0, degraded: 0, failing: 0 })
    expect(Array.isArray(body.sources)).toBe(true)
    expect(mockReportTransition).toHaveBeenCalled()
  })
})
