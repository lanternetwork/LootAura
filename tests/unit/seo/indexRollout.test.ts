import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  evaluateSeoIndexRolloutReadiness,
  getSeoIndexPilotMetroSlugs,
  isMetroAllowedForIndexRollout,
  isSeoIndexRolloutEnvReady,
  resolveListingIndexRobots,
  resolveMetroPageRobots,
} from '@/lib/seo/indexRollout'
import { minimalMetrics } from '../admin/ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'

const originalEnv = process.env

function enableRolloutEnv() {
  process.env.SEO_PUBLIC_INDEXING_ENABLED = 'true'
  process.env.SEO_CRAWL_VALIDATION_PASSED = 'true'
  process.env.SEO_SEARCH_CONSOLE_VALIDATION_PASSED = 'true'
}

describe('seo index rollout', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.SEO_PUBLIC_INDEXING_ENABLED
    delete process.env.SEO_CRAWL_VALIDATION_PASSED
    delete process.env.SEO_SEARCH_CONSOLE_VALIDATION_PASSED
    delete process.env.SEO_INDEX_PILOT_METROS
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('env rollout requires all three attestation flags', () => {
    expect(isSeoIndexRolloutEnvReady()).toBe(false)
    process.env.SEO_PUBLIC_INDEXING_ENABLED = 'true'
    expect(isSeoIndexRolloutEnvReady()).toBe(false)
    enableRolloutEnv()
    expect(isSeoIndexRolloutEnvReady()).toBe(true)
  })

  it('robots stay noindex until rollout env ready', () => {
    expect(resolveListingIndexRobots()).toEqual({ index: false, follow: true })
    enableRolloutEnv()
    expect(resolveListingIndexRobots()).toEqual({ index: true, follow: true })
  })

  it('metro allowlist restricts index robots per slug', () => {
    enableRolloutEnv()
    process.env.SEO_INDEX_PILOT_METROS = 'dallas-tx'
    expect(getSeoIndexPilotMetroSlugs()).toEqual(['dallas-tx'])
    expect(resolveMetroPageRobots('dallas-tx')).toEqual({ index: true, follow: true })
    expect(resolveMetroPageRobots('houston-tx')).toEqual({ index: false, follow: true })
    expect(isMetroAllowedForIndexRollout('houston-tx')).toBe(false)
  })

  it('rollout readiness blocks without Phase 5 attestation', () => {
    process.env.SEO_PUBLIC_INDEXING_ENABLED = 'true'
    const result = evaluateSeoIndexRolloutReadiness({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
    })
    expect(result.indexingAllowed).toBe(false)
    expect(result.blockers.some((b) => b.includes('Crawl validation'))).toBe(true)
    expect(result.blockers.some((b) => b.includes('Search Console'))).toBe(true)
  })

  it('rollout readiness passes when allowlist and attestation env are set', () => {
    enableRolloutEnv()
    const result = evaluateSeoIndexRolloutReadiness({
      metrics: minimalMetrics(),
      coverage: minimalYstmCoverageScoreboard(),
      inventoryByMetroSlug: {
        'dallas-tx': { activeListingCount: 50, lastUpdatedAt: new Date().toISOString(), crawlableInventoryPct: 0.95 },
        'phoenix-az': { activeListingCount: 50, lastUpdatedAt: new Date().toISOString(), crawlableInventoryPct: 0.95 },
        'nashville-tn': { activeListingCount: 50, lastUpdatedAt: new Date().toISOString(), crawlableInventoryPct: 0.95 },
        'atlanta-ga': { activeListingCount: 50, lastUpdatedAt: new Date().toISOString(), crawlableInventoryPct: 0.95 },
        'houston-tx': { activeListingCount: 50, lastUpdatedAt: new Date().toISOString(), crawlableInventoryPct: 0.95 },
      },
    })
    expect(result.indexingAllowed).toBe(true)
    expect(result.qualifiedPilotMetros.length).toBeGreaterThan(0)
  })
})
