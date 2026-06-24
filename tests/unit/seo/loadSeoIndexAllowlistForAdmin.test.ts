import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'

const mockGetCoverage = vi.hoisted(() => vi.fn())
const mockBuildGateMetrics = vi.hoisted(() => vi.fn())

vi.mock('@/lib/seo/buildSeoIngestionGateMetrics', () => ({
  buildSeoIngestionGateMetrics: (...args: unknown[]) => mockBuildGateMetrics(...args),
}))

vi.mock('@/app/api/admin/ingestion/ystm-coverage/route', () => ({
  GET: (...args: unknown[]) => mockGetCoverage(...args),
}))

const mockFetchRollout = vi.hoisted(() => vi.fn())

vi.mock('@/lib/seo/seoRolloutState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo/seoRolloutState')>()
  return {
    ...actual,
    fetchSeoRolloutState: (...args: unknown[]) => mockFetchRollout(...args),
  }
})

describe('loadSeoIndexAllowlistForAdmin', () => {
  const request = new NextRequest('http://localhost/api/admin/seo/distribution-pack')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockFetchRollout.mockResolvedValue({
      publicIndexingEnabled: false,
      publicIndexingEnabledAt: null,
      publicIndexingDisabledAt: null,
      crawlValidationPassed: false,
      crawlValidationPassedAt: null,
      searchConsoleValidationPassed: false,
      searchConsoleValidationPassedAt: null,
    })
  })

  it('derives allowlist from SEO gate metrics and coverage handlers', async () => {
    const { minimalMetrics } = await import('../admin/ystmStabilizationExitCriteria.test')
    mockGetCoverage.mockResolvedValue(NextResponse.json(minimalYstmCoverageScoreboard()))
    mockBuildGateMetrics.mockResolvedValue(minimalMetrics())

    const { loadSeoIndexAllowlistForAdmin, resolveSeoNationalIndexingAllowed } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )
    const allowlist = await loadSeoIndexAllowlistForAdmin(request)

    expect(mockGetCoverage).toHaveBeenCalledWith(request)
    expect(mockBuildGateMetrics).toHaveBeenCalledTimes(1)
    expect(allowlist.tier1Ready).toBe(true)
    expect(resolveSeoNationalIndexingAllowed(allowlist)).toBe(allowlist.indexingAllowed)
  })

  it('fails closed when operational HTTP responses are not ok', async () => {
    const { minimalMetrics } = await import('../admin/ystmStabilizationExitCriteria.test')
    mockGetCoverage.mockResolvedValue(NextResponse.json({ ok: false }, { status: 503 }))
    mockBuildGateMetrics.mockResolvedValue(minimalMetrics())

    const { loadSeoIndexAllowlistForAdmin, SeoOperationalGateUnavailableError } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )

    await expect(loadSeoIndexAllowlistForAdmin(request)).rejects.toBeInstanceOf(
      SeoOperationalGateUnavailableError
    )
  })

  it('fails closed when metrics payload reports failure', async () => {
    mockGetCoverage.mockResolvedValue(NextResponse.json(minimalYstmCoverageScoreboard()))
    mockBuildGateMetrics.mockResolvedValue({ ok: false, error: 'db down' })

    const { loadSeoIndexAllowlistForAdmin, SeoOperationalGateUnavailableError } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )

    await expect(loadSeoIndexAllowlistForAdmin(request)).rejects.toBeInstanceOf(
      SeoOperationalGateUnavailableError
    )
  })
})
