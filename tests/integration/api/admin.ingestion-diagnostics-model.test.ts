import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  diagnosticsV4Coverage,
  diagnosticsV4Metrics,
} from '@/tests/unit/admin/diagnosticsV4Fixtures'

const mockCore = vi.hoisted(() => vi.fn())
const mockDiagnostics = vi.hoisted(() => vi.fn())
const mockCoverage = vi.hoisted(() => vi.fn())

vi.mock('@/lib/admin/ingestionMetricsBuilder', () => ({
  buildIngestionCoreMetricsResponse: (...args: unknown[]) => mockCore(...args),
}))

vi.mock('@/lib/admin/buildIngestionDiagnosticsMetrics', () => ({
  buildIngestionDiagnosticsMetricsResponse: (...args: unknown[]) => mockDiagnostics(...args),
}))

vi.mock('@/lib/admin/ystmCoverageScoreboard', () => ({
  buildYstmCoverageScoreboard: (...args: unknown[]) => mockCoverage(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

describe('GET /api/admin/ingestion/diagnostics-model', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCore.mockReset()
    mockDiagnostics.mockReset()
    mockCoverage.mockReset()
  })

  it('returns diagnostics model for admin', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-test' } })

    mockCore.mockResolvedValue(diagnosticsV4Metrics())
    mockDiagnostics.mockResolvedValue({
      ok: true,
      diagnosticsLoaded: true,
      generatedAt: diagnosticsV4Metrics().generatedAt,
      detailFirstProof: diagnosticsV4Metrics().detailFirstProof,
      failureBreakdown: diagnosticsV4Metrics().failureBreakdown,
      needsCheckBreakdown: null,
      needsCheckRootCauseAnalysis: null,
      listFastFailureDistributionAnalysis: null,
      publishedNotVisibleDistributionAnalysis: null,
      addressEnrichmentDrainCohort: null,
      terminalDisposition: null,
      funnel: diagnosticsV4Metrics().funnel,
      geocodeDeadLetter: {
        replayableTransientNeedsCheck: 0,
        terminalGeocodeNeedsCheck: 0,
      },
    })
    mockCoverage.mockResolvedValue(diagnosticsV4Coverage())

    const { GET } = await import('@/app/api/admin/ingestion/diagnostics-model/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/diagnostics-model'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.model.diagnosticsModelVersion).toBe('4.2.0')
    expect(json.model.slos.length).toBeGreaterThan(0)
    expect(json.model.performance).toBeDefined()
    expect(json.model.performance.total_duration_ms).toBeGreaterThanOrEqual(0)
    expect(json.model.performance.slowest_stage_kind).toBe('route_wall_clock')
    expect(json.model.performance.cache_status).toBe('none')
    expect(mockCore).toHaveBeenCalledTimes(1)
    expect(mockDiagnostics).toHaveBeenCalledTimes(1)
    expect(mockCoverage).toHaveBeenCalledTimes(1)
  })

  it('rejects non-admin callers', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockImplementation(() => {
      throw NextResponse.json({ ok: false }, { status: 403 })
    })
    const { GET } = await import('@/app/api/admin/ingestion/diagnostics-model/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/diagnostics-model'))
    expect(res.status).toBe(403)
  })
})
