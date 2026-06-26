import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildListingFootprint,
  buildSeoOperationsDashboard,
  deriveSeoHealthState,
} from '@/lib/seo/buildSeoOperationsDashboard'
import { buildSeoOperationalSnapshot } from '@/lib/seo/buildSeoOperationalSnapshot'
import { evaluateSeoIndexRolloutReadiness, resolveListingIndexRobots } from '@/lib/seo/indexRollout'
import { computeSeoSitemapCounts } from '@/lib/seo/sitemap/computeSitemapCounts'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import { minimalMetrics } from '../admin/ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'
import { enabledSeoRolloutState, healthyEnablementCoverage } from './seoRolloutTestHelpers'
import { TEST_SEO_METRO_DALLAS } from './seoTestFixtures'

const mockBuildGateMetrics = vi.hoisted(() => vi.fn())
const mockFetchRollout = vi.hoisted(() => vi.fn())
const mockFetchInventory = vi.hoisted(() => vi.fn())
const mockCoverage = vi.hoisted(() => vi.fn())

vi.mock('@/lib/seo/buildSeoIngestionGateMetrics', () => ({
  buildSeoIngestionGateMetrics: (...args: unknown[]) => mockBuildGateMetrics(...args),
}))

vi.mock('@/lib/seo/seoRolloutState', () => ({
  fetchSeoRolloutState: (...args: unknown[]) => mockFetchRollout(...args),
}))

vi.mock('@/lib/seo/fetchAllSeoMetroInventory', () => ({
  fetchNationwideSeoMetroInventory: (...args: unknown[]) => mockFetchInventory(...args),
}))

vi.mock('@/lib/admin/ystmCoverageScoreboard', () => ({
  buildYstmCoverageScoreboard: (...args: unknown[]) => mockCoverage(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
}))

const healthyInventory = {
  activeListingCount: 50,
  lastUpdatedAt: new Date().toISOString(),
  crawlableInventoryPct: 0.95,
}

const qualifiedMetroInventory = {
  'dallas-tx': healthyInventory,
  'phoenix-az': healthyInventory,
  'nashville-tn': healthyInventory,
  'atlanta-ga': healthyInventory,
  'houston-tx': healthyInventory,
}

const qualifiedMetros = [
  TEST_SEO_METRO_DALLAS,
  { slug: 'phoenix-az', city: 'Phoenix', state: 'AZ', timezone: 'America/Phoenix', minActiveListings: 25 },
  { slug: 'nashville-tn', city: 'Nashville', state: 'TN', timezone: 'America/Chicago', minActiveListings: 25 },
  { slug: 'atlanta-ga', city: 'Atlanta', state: 'GA', timezone: 'America/New_York', minActiveListings: 25 },
  { slug: 'houston-tx', city: 'Houston', state: 'TX', timezone: 'America/Chicago', minActiveListings: 25 },
]

function assertListingEmissionBlocked(seoEmissionAllowed: boolean, publishedCount = 1000) {
  expect(seoEmissionAllowed).toBe(false)
  expect(resolveListingIndexRobots(seoEmissionAllowed)).toEqual({ index: false, follow: true })

  const plan = resolveSeoSitemapPlan(publishedCount, seoEmissionAllowed)
  expect(plan.indexingEnabled).toBe(false)
  expect(plan.segmentIds).toEqual(['static'])
  expect(plan.listingChunkCount).toBe(0)

  const counts = computeSeoSitemapCounts({
    totalPublishedListings: publishedCount,
    listingIndexingAllowed: seoEmissionAllowed,
    geoIndexingAllowed: false,
    metros: qualifiedMetros,
    inventoryBySlug: qualifiedMetroInventory,
  })
  expect(counts.listingUrlCount).toBe(0)

  expect(buildListingFootprint(publishedCount, seoEmissionAllowed)).toEqual({
    published: publishedCount,
    indexable: 0,
    noindex: publishedCount,
  })
}

describe('inventory SEO emission policy (SEO_ENABLEMENT_V2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockFetchRollout.mockResolvedValue(enabledSeoRolloutState())
    mockFetchInventory.mockResolvedValue({
      metros: qualifiedMetros,
      inventoryBySlug: qualifiedMetroInventory,
    })
    mockCoverage.mockResolvedValue(healthyEnablementCoverage())
    mockBuildGateMetrics.mockResolvedValue(minimalMetrics())
  })

  it('scenario 1 — attestations true, metric gate false', () => {
    const coverage = minimalYstmCoverageScoreboard({
      coveragePct: 85,
      publishedActiveLootAuraYstmUrls: 500,
    })

    const rollout = evaluateSeoIndexRolloutReadiness({
      coverage,
      metros: qualifiedMetros,
      inventoryByMetroSlug: qualifiedMetroInventory,
      rolloutState: enabledSeoRolloutState(),
    })

    expect(rollout.seoEmissionAllowed).toBe(false)
    assertListingEmissionBlocked(rollout.seoEmissionAllowed)

    const snapshot = buildSeoOperationalSnapshot({
      metrics: minimalMetrics(),
      coverage,
      sitemapCounts: computeSeoSitemapCounts({
        totalPublishedListings: 1000,
        listingIndexingAllowed: rollout.seoEmissionAllowed,
        geoIndexingAllowed: rollout.indexingAllowed,
        metros: qualifiedMetros,
        inventoryBySlug: qualifiedMetroInventory,
      }),
      metros: qualifiedMetros,
      inventoryByMetroSlug: qualifiedMetroInventory,
      rolloutState: enabledSeoRolloutState(),
    })

    expect(deriveSeoHealthState(snapshot)).toBe('BLOCKED')
    const dashboard = buildSeoOperationsDashboard({
      snapshot,
      rolloutState: enabledSeoRolloutState(),
      publishedListingCount: 1000,
    })
    expect(dashboard.health).toBe('BLOCKED')
    expect(dashboard.indexability.listings).toBe('NOINDEX')
  })

  it('scenario 2 — emission on, 0 qualified metros (listings index, geo blocked)', () => {
    const coverage = healthyEnablementCoverage()
    const rollout = evaluateSeoIndexRolloutReadiness({
      coverage,
      metros: [TEST_SEO_METRO_DALLAS],
      inventoryByMetroSlug: {
        'dallas-tx': {
          activeListingCount: 5,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
      },
      rolloutState: enabledSeoRolloutState(),
    })

    expect(rollout.seoEmissionAllowed).toBe(true)
    expect(rollout.indexingAllowed).toBe(false)
    expect(resolveListingIndexRobots(rollout.seoEmissionAllowed)).toEqual({ index: true, follow: true })

    const listingPlan = resolveSeoSitemapPlan(500, rollout.seoEmissionAllowed)
    expect(listingPlan.indexingEnabled).toBe(true)
    const geoPlan = resolveSeoSitemapPlan(500, rollout.indexingAllowed)
    expect(geoPlan.indexingEnabled).toBe(false)
    expect(geoPlan.segmentIds).toEqual(['static'])

    const snapshot = buildSeoOperationalSnapshot({
      metrics: minimalMetrics(),
      coverage,
      sitemapCounts: computeSeoSitemapCounts({
        totalPublishedListings: 500,
        listingIndexingAllowed: rollout.seoEmissionAllowed,
        geoIndexingAllowed: rollout.indexingAllowed,
        metros: [TEST_SEO_METRO_DALLAS],
        inventoryBySlug: {
          'dallas-tx': {
            activeListingCount: 5,
            lastUpdatedAt: new Date().toISOString(),
            crawlableInventoryPct: 0.95,
          },
        },
      }),
      metros: [TEST_SEO_METRO_DALLAS],
      inventoryByMetroSlug: {
        'dallas-tx': {
          activeListingCount: 5,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
      },
      rolloutState: enabledSeoRolloutState(),
    })

    expect(deriveSeoHealthState(snapshot)).toBe('ACTION_REQUIRED')
    expect(snapshot.sitemap.listingIndexingEnabled).toBe(true)
    expect(snapshot.sitemap.indexingEnabled).toBe(false)
  })

  it('scenario 3 — emission on, qualified metros > 0', () => {
    const coverage = healthyEnablementCoverage()
    const rollout = evaluateSeoIndexRolloutReadiness({
      coverage,
      metros: qualifiedMetros,
      inventoryByMetroSlug: qualifiedMetroInventory,
      rolloutState: enabledSeoRolloutState(),
    })

    expect(rollout.seoEmissionAllowed).toBe(true)
    expect(rollout.indexingAllowed).toBe(true)
    expect(resolveListingIndexRobots(rollout.seoEmissionAllowed)).toEqual({ index: true, follow: true })

    const geoPlan = resolveSeoSitemapPlan(2500, rollout.indexingAllowed)
    expect(geoPlan.indexingEnabled).toBe(true)
    expect(geoPlan.segmentIds).toContain('cities')
    expect(geoPlan.segmentIds).toContain('weekends')

    const counts = computeSeoSitemapCounts({
      totalPublishedListings: 2500,
      listingIndexingAllowed: rollout.seoEmissionAllowed,
      geoIndexingAllowed: rollout.indexingAllowed,
      metros: qualifiedMetros,
      inventoryBySlug: qualifiedMetroInventory,
    })
    expect(counts.listingUrlCount).toBe(2500)
    expect(counts.cityUrlCount).toBeGreaterThan(0)
    expect(counts.weekendUrlCount).toBeGreaterThan(0)

    const snapshot = buildSeoOperationalSnapshot({
      metrics: minimalMetrics(),
      coverage,
      sitemapCounts: counts,
      metros: qualifiedMetros,
      inventoryByMetroSlug: qualifiedMetroInventory,
      rolloutState: enabledSeoRolloutState(),
    })

    expect(deriveSeoHealthState(snapshot)).toBe('READY')
    const dashboard = buildSeoOperationsDashboard({
      snapshot,
      rolloutState: enabledSeoRolloutState(),
      publishedListingCount: 2500,
    })
    expect(dashboard.health).toBe('READY')
    expect(dashboard.indexability.listings).toBe('INDEX')
    expect(dashboard.listingFootprint.indexable).toBe(2500)
    expect(dashboard.sitemap.indexingEnabled).toBe(true)
  })

  it('scenario 4 — metrics unavailable fails closed via shared resolver', async () => {
    mockBuildGateMetrics.mockResolvedValue({ ok: false, error: 'db down' })

    const { getInventorySeoEmissionForRequest } = await import('@/lib/seo/resolveInventorySeoEmission')
    const emission = await getInventorySeoEmissionForRequest()

    expect(emission.metricsAvailable).toBe(false)
    expect(emission.seoEmissionAllowed).toBe(false)
    expect(emission.indexingAllowed).toBe(false)
    assertListingEmissionBlocked(emission.seoEmissionAllowed)
  })
})
