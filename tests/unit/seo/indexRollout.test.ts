import { describe, it, expect } from 'vitest'
import {
  evaluateSeoIndexRolloutReadiness,
  isSeoIndexRolloutReady,
  resolveListingIndexRobots,
  resolveMetroPageRobots,
} from '@/lib/seo/indexRollout'
import { SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutTypes'
import { minimalMetrics } from '../admin/ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'
import { enabledSeoRolloutState } from './seoRolloutTestHelpers'
import { TEST_SEO_METRO_AUSTIN, TEST_SEO_METRO_DALLAS } from './seoTestFixtures'

const healthyInventory = {
  activeListingCount: 50,
  lastUpdatedAt: new Date().toISOString(),
  crawlableInventoryPct: 0.95,
}

describe('seo index rollout', () => {
  it('rollout requires all three admin attestations', () => {
    expect(isSeoIndexRolloutReady(SEO_ROLLOUT_DISABLED_STATE)).toBe(false)
    expect(
      isSeoIndexRolloutReady(
        enabledSeoRolloutState({ crawlValidationPassed: false, searchConsoleValidationPassed: false })
      )
    ).toBe(false)
    expect(isSeoIndexRolloutReady(enabledSeoRolloutState())).toBe(true)
  })

  it('robots stay noindex until rollout attestations are enabled', () => {
    expect(resolveListingIndexRobots(SEO_ROLLOUT_DISABLED_STATE)).toEqual({
      index: false,
      follow: true,
    })
    expect(resolveListingIndexRobots(enabledSeoRolloutState())).toEqual({
      index: true,
      follow: true,
    })
  })

  it('metro pages index only when operational qualification passes', () => {
    const rollout = enabledSeoRolloutState()
    expect(
      resolveMetroPageRobots(TEST_SEO_METRO_AUSTIN, rollout, {
        activeListingCount: 5,
        lastUpdatedAt: new Date().toISOString(),
        crawlableInventoryPct: 0.95,
      }, true)
    ).toEqual({ index: false, follow: true })
    expect(
      resolveMetroPageRobots(TEST_SEO_METRO_DALLAS, rollout, healthyInventory, true)
    ).toEqual({ index: true, follow: true })
  })

  it('rollout readiness blocks without Phase 5 attestations', () => {
    const result = evaluateSeoIndexRolloutReadiness({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
      metros: [TEST_SEO_METRO_DALLAS],
      rolloutState: enabledSeoRolloutState({
        crawlValidationPassed: false,
        searchConsoleValidationPassed: false,
      }),
    })
    expect(result.indexingAllowed).toBe(false)
    expect(result.blockers.some((b) => b.includes('Crawl validation'))).toBe(true)
    expect(result.blockers.some((b) => b.includes('Search Console'))).toBe(true)
  })

  it('rollout readiness passes when allowlist and attestations are enabled', () => {
    const metros = [
      TEST_SEO_METRO_DALLAS,
      { slug: 'phoenix-az', city: 'Phoenix', state: 'AZ', timezone: 'America/Phoenix', minActiveListings: 25 },
      { slug: 'nashville-tn', city: 'Nashville', state: 'TN', timezone: 'America/Chicago', minActiveListings: 25 },
      { slug: 'atlanta-ga', city: 'Atlanta', state: 'GA', timezone: 'America/New_York', minActiveListings: 25 },
      { slug: 'houston-tx', city: 'Houston', state: 'TX', timezone: 'America/Chicago', minActiveListings: 25 },
    ]
    const result = evaluateSeoIndexRolloutReadiness({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
      metros,
      rolloutState: enabledSeoRolloutState(),
      inventoryByMetroSlug: {
        'dallas-tx': {
          activeListingCount: 50,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
        'phoenix-az': {
          activeListingCount: 50,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
        'nashville-tn': {
          activeListingCount: 50,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
        'atlanta-ga': {
          activeListingCount: 50,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
        'houston-tx': {
          activeListingCount: 50,
          lastUpdatedAt: new Date().toISOString(),
          crawlableInventoryPct: 0.95,
        },
      },
    })
    expect(result.indexingAllowed).toBe(true)
    expect(result.qualifiedMetroSlugs.length).toBeGreaterThan(0)
  })
})
