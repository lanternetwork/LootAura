import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockDiagnostics = vi.hoisted(() => vi.fn())

vi.mock('@/lib/admin/buildIngestionDiagnosticsMetrics', () => ({
  buildIngestionDiagnosticsMetricsResponse: (...args: unknown[]) => mockDiagnostics(...args),
}))

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

describe('GET /api/admin/ingestion/metrics/diagnostics', () => {
  beforeEach(() => {
    vi.resetModules()
    mockDiagnostics.mockReset()
  })

  it('returns diagnostics payload for admin', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-test' } })
    mockDiagnostics.mockResolvedValue({
      ok: true,
      generatedAt: new Date().toISOString(),
      diagnosticsLoaded: true,
      needsCheckBreakdown: { total: 1 },
    })

    const { GET } = await import('@/app/api/admin/ingestion/metrics/diagnostics/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/metrics/diagnostics'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.diagnosticsLoaded).toBe(true)
    expect(mockDiagnostics).toHaveBeenCalledTimes(1)
  })

  it('rejects non-admin callers', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    vi.mocked(assertAdminOrThrow).mockImplementation(() => {
      throw NextResponse.json({ ok: false }, { status: 403 })
    })
    const { GET } = await import('@/app/api/admin/ingestion/metrics/diagnostics/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/ingestion/metrics/diagnostics'))
    expect(res.status).toBe(403)
  })
})
