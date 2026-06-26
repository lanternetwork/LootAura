import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { enabledSeoRolloutState } from '../../unit/seo/seoRolloutTestHelpers'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

function stubInfrastructure(overrides: Record<string, unknown> = {}) {
  return {
    enablementSnapshotAgeMinutes: 5,
    qualifiedMetroSnapshotAgeMinutes: 5,
    inventorySnapshotAgeMinutes: 5,
    qualifiedMetroCount: 1,
    sitemapInventoryCount: 10,
    ...overrides,
  }
}

function stubOperationalSnapshot(overrides: {
  rollout?: Record<string, unknown>
  enablement?: Record<string, unknown>
  allowlist?: Record<string, unknown>
  sitemap?: Record<string, unknown>
  metroParticipation?: Record<string, unknown>
} = {}) {
  const rolloutState = enabledSeoRolloutState()
  return {
    generatedAt: '2026-06-02T00:00:00.000Z',
    enablement: {
      generatedAt: '2026-06-02T00:00:00.000Z',
      metricGatePass: true,
      seoEmissionAllowed: true,
      readyForIndexing: true,
      gates: [],
      blockers: [],
      ...overrides.enablement,
    },
    allowlist: {
      generatedAt: '2026-06-02T00:00:00.000Z',
      indexingAllowed: true,
      phase0Pass: true,
      tier1Ready: true,
      tier2Ready: true,
      enforcementReady: true,
      gates: [],
      blockers: [],
      ...overrides.allowlist,
    },
    stabilization: {
      tier1Ready: true,
      tier2Ready: true,
      tier1Criteria: [],
      tier2Criteria: [],
      holdNote: '',
    },
    rollout: {
      generatedAt: '2026-06-02T00:00:00.000Z',
      seoEmissionAllowed: true,
      indexingAllowed: true,
      blockers: [],
      gates: [],
      qualifiedMetroSlugs: ['dallas-tx'],
      qualifiedPilotMetros: ['dallas-tx'],
      rolloutState,
      ...overrides.rollout,
    },
    metroQualification: [],
    metroParticipation: {
      generatedAt: '2026-06-02T00:00:00.000Z',
      participatingMetroSlugs: ['dallas-tx'],
      rows: [
        {
          slug: 'dallas-tx',
          qualified: true,
          score: 100,
          reasons: [],
          metro: TEST_SEO_METRO_DALLAS,
          inventory: {
            activeListingCount: 50,
            lastUpdatedAt: '2026-06-02T00:00:00.000Z',
            crawlableInventoryPct: 1,
          },
        },
      ],
      ...overrides.metroParticipation,
    },
    sitemap: {
      staticUrlCount: 3,
      listingChunkCount: 1,
      listingUrlCount: 10,
      cityUrlCount: 1,
      weekendUrlCount: 1,
      indexingEnabled: true,
      listingIndexingEnabled: true,
      ...overrides.sitemap,
    },
    metrics: {
      indexedMetros: 1,
      crawlableInventoryPct: 1,
      staleInventoryPct: null,
      canonicalCoveragePct: null,
      duplicateCanonicalClusters: null,
      duplicateVisibleClusters: null,
      catalogRepairQueue: null,
      missingValidUrls: null,
    },
  }
}

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: vi.fn(),
}))

vi.mock('@/lib/seo/loadSeoOperationsDashboard', () => ({
  loadSeoOperationsDashboard: vi.fn(),
}))

describe('GET /api/admin/seo/operations-dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns dashboard payload when admin authorized', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { loadSeoOperationsDashboard } = await import('@/lib/seo/loadSeoOperationsDashboard')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    vi.mocked(loadSeoOperationsDashboard).mockResolvedValue({
      generatedAt: '2026-06-02T00:00:00.000Z',
      health: 'READY',
      blockers: [],
      rolloutState: enabledSeoRolloutState(),
      canonical: {
        configuredEnv: 'https://lootaura.com',
        effectiveCanonical: 'https://lootaura.com',
        usingFallback: false,
        fallbackUrl: 'https://lootaura.app',
      },
      indexability: {
        listings: 'INDEX',
        qualifiedMetroCount: 1,
        blockedMetroCount: 0,
        totalMetroCount: 1,
        defaultDirective: 'index,follow',
      },
      listingFootprint: { published: 10, indexable: 10, noindex: 0 },
      sitemap: {
        sitemapUrl: 'https://lootaura.com/sitemap.xml',
        indexingEnabled: true,
        segments: ['static', 'listings-0', 'cities', 'weekends'],
        staticUrlCount: 3,
        listingUrlCount: 10,
        cityUrlCount: 1,
        weekendUrlCount: 1,
      },
      internalLinks: {
        sampleSize: 10,
        listingsWithCityLink: 8,
        listingsWithWeekendLink: 8,
        nearbySaleLinks: 40,
        nearbySampleSize: 10,
        label: 'Sample estimate (10 listings; nearby from 10)',
      },
      infrastructure: stubInfrastructure(),
      snapshot: stubOperationalSnapshot(),
      crawlSmoke: null,
    })

    const { GET } = await import('@/app/api/admin/seo/operations-dashboard/route')
    const response = await GET(
      new NextRequest('http://localhost/api/admin/seo/operations-dashboard')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.dashboard.health).toBe('READY')
    expect(body.diagnosticsText).toContain('SEO HEALTH: READY')
    expect(loadSeoOperationsDashboard).toHaveBeenCalledWith(expect.any(NextRequest), {
      runCrawlSmoke: false,
    })
  })

  it('passes crawlSmoke flag when requested', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { loadSeoOperationsDashboard } = await import('@/lib/seo/loadSeoOperationsDashboard')
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    vi.mocked(loadSeoOperationsDashboard).mockResolvedValue({
      generatedAt: '2026-06-02T00:00:00.000Z',
      health: 'ACTION_REQUIRED',
      blockers: [],
      rolloutState: enabledSeoRolloutState({ crawlValidationPassed: false }),
      canonical: {
        configuredEnv: null,
        effectiveCanonical: 'https://lootaura.app',
        usingFallback: true,
        fallbackUrl: 'https://lootaura.app',
      },
      indexability: {
        listings: 'NOINDEX',
        qualifiedMetroCount: 0,
        blockedMetroCount: 0,
        totalMetroCount: 0,
        defaultDirective: 'noindex,follow',
      },
      listingFootprint: { published: 0, indexable: 0, noindex: 0 },
      sitemap: {
        sitemapUrl: 'https://lootaura.app/sitemap.xml',
        indexingEnabled: false,
        segments: ['static'],
        staticUrlCount: 3,
        listingUrlCount: 0,
        cityUrlCount: 0,
        weekendUrlCount: 0,
      },
      internalLinks: {
        sampleSize: 0,
        listingsWithCityLink: 0,
        listingsWithWeekendLink: 0,
        nearbySaleLinks: 0,
        nearbySampleSize: 0,
        label: 'Sample estimate (0 listings)',
      },
      infrastructure: stubInfrastructure({
        qualifiedMetroCount: 0,
        sitemapInventoryCount: 0,
      }),
      snapshot: stubOperationalSnapshot({
        enablement: {
          metricGatePass: true,
          seoEmissionAllowed: false,
          readyForIndexing: false,
          blockers: ['Crawl validation not attested (admin)'],
        },
        allowlist: {
          indexingAllowed: false,
          phase0Pass: false,
          tier1Ready: false,
          tier2Ready: false,
          enforcementReady: false,
          blockers: ['Tier 1: example'],
        },
        rollout: {
          seoEmissionAllowed: false,
          indexingAllowed: false,
          blockers: ['Crawl validation not attested (admin)'],
          qualifiedMetroSlugs: [],
          qualifiedPilotMetros: [],
          rolloutState: enabledSeoRolloutState({ crawlValidationPassed: false }),
        },
        metroParticipation: {
          participatingMetroSlugs: [],
          rows: [],
        },
        sitemap: {
          listingChunkCount: 0,
          listingUrlCount: 0,
          cityUrlCount: 0,
          weekendUrlCount: 0,
          indexingEnabled: false,
          listingIndexingEnabled: false,
        },
      }),
      crawlSmoke: {
        generatedAt: '2026-06-02T00:00:00.000Z',
        baseUrl: 'https://lootaura.app',
        passed: false,
        checks: [{ id: 'city_status', label: 'City page', url: 'x', pass: false, detail: 'HTTP 500' }],
      },
    })

    const { GET } = await import('@/app/api/admin/seo/operations-dashboard/route')
    const response = await GET(
      new NextRequest('http://localhost/api/admin/seo/operations-dashboard?crawlSmoke=1')
    )

    expect(response.status).toBe(200)
    expect(loadSeoOperationsDashboard).toHaveBeenCalledWith(expect.any(NextRequest), {
      runCrawlSmoke: true,
    })
  })

  it('returns BLOCKED dashboard when operational metrics are unavailable', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { loadSeoOperationsDashboard } = await import('@/lib/seo/loadSeoOperationsDashboard')
    const { SeoOperationalGateUnavailableError } = await import(
      '@/lib/seo/loadSeoIndexAllowlistForAdmin'
    )
    vi.mocked(assertAdminOrThrow).mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } })
    vi.mocked(loadSeoOperationsDashboard).mockRejectedValue(
      new SeoOperationalGateUnavailableError('metrics down')
    )

    const { GET } = await import('@/app/api/admin/seo/operations-dashboard/route')
    const response = await GET(
      new NextRequest('http://localhost/api/admin/seo/operations-dashboard')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.metricsUnavailable).toBe(true)
    expect(body.dashboard.health).toBe('BLOCKED')
    expect(body.diagnosticsText).toContain('SEO HEALTH: BLOCKED')
    expect(body.dashboard.indexability.listings).toBe('NOINDEX')
  })

  it('returns 403 when admin gate rejects', async () => {
    const { assertAdminOrThrow } = await import('@/lib/auth/adminGate')
    const { NextResponse } = await import('next/server')
    vi.mocked(assertAdminOrThrow).mockRejectedValue(
      NextResponse.json({ ok: false }, { status: 403 })
    )

    const { GET } = await import('@/app/api/admin/seo/operations-dashboard/route')
    const response = await GET(
      new NextRequest('http://localhost/api/admin/seo/operations-dashboard')
    )

    expect(response.status).toBe(403)
  })
})
