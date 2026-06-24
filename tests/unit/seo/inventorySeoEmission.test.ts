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
import { enabledSeoRolloutState } from './seoRolloutTestHelpers'
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

function assertNonReadyInventoryEmission(indexingAllowed: boolean, publishedCount = 1000) {
  expect(indexingAllowed).toBe(false)
  expect(resolveListingIndexRobots(indexingAllowed)).toEqual({ index: false, follow: true })

  const plan = resolveSeoSitemapPlan(publishedCount, indexingAllowed)
  expect(plan.indexingEnabled).toBe(false)
  expect(plan.segmentIds).toEqual(['static'])
  expect(plan.listingChunkCount).toBe(0)

  const counts = computeSeoSitemapCounts({
    totalPublishedListings: publishedCount,
    inventoryIndexingAllowed: indexingAllowed,
    metros: qualifiedMetros,
    inventoryBySlug: qualifiedMetroInventory,
  })
  expect(counts.listingUrlCount).toBe(0)
  expect(counts.cityUrlCount).toBe(0)
  expect(counts.weekendUrlCount).toBe(0)

  expect(buildListingFootprint(publishedCount, indexingAllowed)).toEqual({
    published: publishedCount,
    indexable: 0,
    noindex: publishedCount,
  })
}

describe('inventory SEO emission policy (R)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockFetchRollout.mockResolvedValue(enabledSeoRolloutState())
    mockFetchInventory.mockResolvedValue({
      metros: qualifiedMetros,
      inventoryBySlug: qualifiedMetroInventory,
    })
    mockCoverage.mockResolvedValue(minimalYstmCoverageScoreboard())
    mockBuildGateMetrics.mockResolvedValue(minimalMetrics())
  })

  it('scenario 1 — attestations true, allowlist false', () => {
    const coverage = minimalYstmCoverageScoreboard({
      catalogRepair: {
        repairQueueTotal: 150,
        needsGeocode: 0,
        readyUnpublished: 0,
        publishFailed: 0,
        needsCheck: 0,
        repairedPublishedLast24h: 0,
        repairFailed: 0,
      },
      pipelineBacklog: {
        missingValidUrls: 10,
        missingIngestionQueue: 10,
        missingIngestionNeverAttempted: 3,
        catalogRepairQueue: 150,
        existingRefreshStale: 0,
      },
    })

    const rollout = evaluateSeoIndexRolloutReadiness({
      metrics: minimalMetrics(),
      coverage,
      metros: qualifiedMetros,
      inventoryByMetroSlug: qualifiedMetroInventory,
      rolloutState: enabledSeoRolloutState(),
    })

    expect(rollout.rolloutState.crawlValidationPassed).toBe(true)
    expect(rollout.rolloutState.searchConsoleValidationPassed).toBe(true)
    assertNonReadyInventoryEmission(rollout.indexingAllowed)

    const snapshot = buildSeoOperationalSnapshot({
      metrics: minimalMetrics(),
      coverage,
      sitemapCounts: computeSeoSitemapCounts({
        totalPublishedListings: 1000,
        inventoryIndexingAllowed: rollout.indexingAllowed,
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
    expect(dashboard.listingFootprint.indexable).toBe(0)
  })

  it('scenario 2 — attestations true, allowlist true, 0 qualified metros', () => {
    const rollout = evaluateSeoIndexRolloutReadiness({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
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

    expect(rollout.indexingAllowed).toBe(false)
    assertNonReadyInventoryEmission(rollout.indexingAllowed)

    const snapshot = buildSeoOperationalSnapshot({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
      sitemapCounts: computeSeoSitemapCounts({
        totalPublishedListings: 500,
        inventoryIndexingAllowed: rollout.indexingAllowed,
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

    expect(snapshot.allowlist.indexingAllowed).toBe(true)
    expect(deriveSeoHealthState(snapshot)).toBe('ACTION_REQUIRED')
  })

  it('scenario 3 — attestations true, allowlist true, qualified metros > 0', () => {
    const rollout = evaluateSeoIndexRolloutReadiness({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
      metros: qualifiedMetros,
      inventoryByMetroSlug: qualifiedMetroInventory,
      rolloutState: enabledSeoRolloutState(),
    })

    expect(rollout.indexingAllowed).toBe(true)
    expect(resolveListingIndexRobots(rollout.indexingAllowed)).toEqual({ index: true, follow: true })

    const plan = resolveSeoSitemapPlan(2500, rollout.indexingAllowed)
    expect(plan.indexingEnabled).toBe(true)
    expect(plan.listingChunkCount).toBeGreaterThan(0)
    expect(plan.segmentIds).toContain('cities')
    expect(plan.segmentIds).toContain('weekends')

    const counts = computeSeoSitemapCounts({
      totalPublishedListings: 2500,
      inventoryIndexingAllowed: rollout.indexingAllowed,
      metros: qualifiedMetros,
      inventoryBySlug: qualifiedMetroInventory,
    })
    expect(counts.listingUrlCount).toBe(2500)
    expect(counts.cityUrlCount).toBeGreaterThan(0)
    expect(counts.weekendUrlCount).toBeGreaterThan(0)

    const snapshot = buildSeoOperationalSnapshot({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
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
    expect(emission.indexingAllowed).toBe(false)
    assertNonReadyInventoryEmission(emission.indexingAllowed)
  })
})
