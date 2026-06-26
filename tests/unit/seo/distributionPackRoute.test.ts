import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockAssertAdmin = vi.hoisted(() => vi.fn())
const mockLoadAllowlist = vi.hoisted(() => vi.fn())
const mockFetchMetroInventory = vi.hoisted(() => vi.fn())
const mockDiscoverMetros = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: unknown[]) => mockAssertAdmin(...args),
}))

vi.mock('@/lib/seo/loadSeoIndexAllowlistForAdmin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo/loadSeoIndexAllowlistForAdmin')>()
  return {
    ...actual,
    loadSeoIndexAllowlistForAdmin: (...args: unknown[]) => mockLoadAllowlist(...args),
  }
})

vi.mock('@/lib/seo/fetchMetroInventory', () => ({
  fetchMetroInventory: (...args: unknown[]) => mockFetchMetroInventory(...args),
}))

vi.mock('@/lib/seo/metroCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo/metroCatalog')>()
  return {
    ...actual,
    discoverSeoMetrosFromPublishedSales: (...args: unknown[]) => mockDiscoverMetros(...args),
  }
})

vi.mock('@/lib/seo/fetchMetroWeekendInventory', () => ({
  fetchMetroWeekendInventory: vi.fn(),
}))

describe('GET /api/admin/seo/distribution-pack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertAdmin.mockResolvedValue(undefined)
    mockDiscoverMetros.mockResolvedValue([
      {
        slug: 'dallas-tx',
        city: 'Dallas',
        state: 'TX',
        timezone: 'America/Chicago',
        minActiveListings: 25,
      },
    ])
    mockLoadAllowlist.mockResolvedValue({
      allowlist: {
        indexingAllowed: false,
        phase0Pass: false,
        tier1Ready: true,
        tier2Ready: true,
        enforcementReady: true,
        gates: [],
        blockers: ['SEO public indexing is not enabled by admin (Phase 0)'],
        generatedAt: new Date().toISOString(),
      },
      enablement: {
        generatedAt: new Date().toISOString(),
        metricGatePass: true,
        seoEmissionAllowed: false,
        readyForIndexing: false,
        gates: [],
        blockers: ['SEO public indexing is not enabled by admin (Phase 0)'],
      },
    })
    mockFetchMetroInventory.mockResolvedValue({
      sales: [],
      summary: {
        activeListingCount: 40,
        lastUpdatedAt: new Date().toISOString(),
        crawlableInventoryPct: 0.9,
      },
    })
  })

  it('rejects caller-provided nationalIndexingAllowed query parameter', async () => {
    const { GET } = await import('@/app/api/admin/seo/distribution-pack/route')
    const request = new NextRequest(
      'http://localhost/api/admin/seo/distribution-pack?metroSlug=dallas-tx&surface=reddit_city&nationalIndexingAllowed=true'
    )
    const res = await GET(request)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_REQUEST')
    expect(body.message).toContain('not accepted')
    expect(mockLoadAllowlist).not.toHaveBeenCalled()
  })

  it('derives eligibility server-side and cannot be forced via query param', async () => {
    const { GET } = await import('@/app/api/admin/seo/distribution-pack/route')
    const request = new NextRequest(
      'http://localhost/api/admin/seo/distribution-pack?metroSlug=dallas-tx&surface=reddit_city'
    )
    const res = await GET(request)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockLoadAllowlist).toHaveBeenCalledWith(request)
    expect(body.pack.eligible).toBe(false)
    expect(body.pack.blockers.some((b: string) => b.includes('National SEO'))).toBe(true)
  })

  it('returns 503 when operational gate state cannot be determined', async () => {
    const { SeoOperationalGateUnavailableError } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )
    mockLoadAllowlist.mockRejectedValue(new SeoOperationalGateUnavailableError('metrics down'))

    const { GET } = await import('@/app/api/admin/seo/distribution-pack/route')
    const request = new NextRequest(
      'http://localhost/api/admin/seo/distribution-pack?metroSlug=dallas-tx&surface=reddit_city'
    )
    const res = await GET(request)
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.code).toBe('OPERATIONAL_GATES_UNAVAILABLE')
  })
})
