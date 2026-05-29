import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { minimalMetrics } from '../admin/ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'

const mockGetMetrics = vi.hoisted(() => vi.fn())
const mockGetCoverage = vi.hoisted(() => vi.fn())

vi.mock('@/app/api/admin/ingestion/metrics/route', () => ({
  GET: (...args: unknown[]) => mockGetMetrics(...args),
}))

vi.mock('@/app/api/admin/ingestion/ystm-coverage/route', () => ({
  GET: (...args: unknown[]) => mockGetCoverage(...args),
}))

describe('loadSeoIndexAllowlistForAdmin', () => {
  const request = new NextRequest('http://localhost/api/admin/seo/distribution-pack')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('derives allowlist from admin metrics and coverage handlers', async () => {
    mockGetCoverage.mockResolvedValue(NextResponse.json(minimalYstmCoverageScoreboard()))
    mockGetMetrics.mockResolvedValue(NextResponse.json(minimalMetrics()))

    const { loadSeoIndexAllowlistForAdmin, resolveSeoNationalIndexingAllowed } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )
    const allowlist = await loadSeoIndexAllowlistForAdmin(request)

    expect(mockGetCoverage).toHaveBeenCalledWith(request)
    expect(mockGetMetrics).toHaveBeenCalledWith(request)
    expect(allowlist.tier1Ready).toBe(true)
    expect(resolveSeoNationalIndexingAllowed(allowlist)).toBe(allowlist.indexingAllowed)
  })

  it('fails closed when operational HTTP responses are not ok', async () => {
    mockGetCoverage.mockResolvedValue(NextResponse.json({ ok: false }, { status: 503 }))
    mockGetMetrics.mockResolvedValue(NextResponse.json(minimalMetrics()))

    const { loadSeoIndexAllowlistForAdmin, SeoOperationalGateUnavailableError } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )

    await expect(loadSeoIndexAllowlistForAdmin(request)).rejects.toBeInstanceOf(
      SeoOperationalGateUnavailableError
    )
  })

  it('fails closed when metrics payload reports failure', async () => {
    mockGetCoverage.mockResolvedValue(NextResponse.json(minimalYstmCoverageScoreboard()))
    mockGetMetrics.mockResolvedValue(NextResponse.json({ ok: false, error: 'db down' }))

    const { loadSeoIndexAllowlistForAdmin, SeoOperationalGateUnavailableError } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )

    await expect(loadSeoIndexAllowlistForAdmin(request)).rejects.toBeInstanceOf(
      SeoOperationalGateUnavailableError
    )
  })
})
