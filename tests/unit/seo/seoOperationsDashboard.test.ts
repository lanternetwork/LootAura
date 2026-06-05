import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildCanonicalSummary,
  buildListingFootprint,
  buildSeoOperationsDashboard,
  deriveSeoHealthState,
  formatSeoDiagnosticsText,
} from '@/lib/seo/buildSeoOperationsDashboard'
import { buildSeoOperationalSnapshot } from '@/lib/seo/buildSeoOperationalSnapshot'
import { SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutTypes'
import { enabledSeoRolloutState } from './seoRolloutTestHelpers'
import { minimalMetrics } from '../admin/ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from '../admin/evaluateYstmSaleInstanceRolloutGates.test'
import { TEST_SEO_METRO_DALLAS } from './seoTestFixtures'

function buildTestSnapshot(rolloutState = SEO_ROLLOUT_DISABLED_STATE) {
  return buildSeoOperationalSnapshot({
    metrics: minimalMetrics(),
    coverage: minimalYstmCoverageScoreboard(),
    sitemapCounts: {
      staticUrlCount: 3,
      listingChunkCount: 0,
      listingUrlCount: 0,
      cityUrlCount: 0,
      weekendUrlCount: 0,
    },
    metros: [TEST_SEO_METRO_DALLAS],
    inventoryByMetroSlug: {
      'dallas-tx': {
        activeListingCount: 50,
        lastUpdatedAt: '2026-05-30T00:00:00.000Z',
        crawlableInventoryPct: 0.95,
      },
    },
    rolloutState,
  })
}

describe('seo operations dashboard', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('derives READY when rollout indexing is allowed', () => {
    const snapshot = buildTestSnapshot(enabledSeoRolloutState())
    expect(deriveSeoHealthState(snapshot)).toBe('READY')
  })

  it('derives BLOCKED when ingestion allowlist fails', () => {
    const snapshot = buildTestSnapshot(SEO_ROLLOUT_DISABLED_STATE)
    expect(deriveSeoHealthState(snapshot)).toBe('BLOCKED')
  })

  it('derives ACTION_REQUIRED when allowlist passes but rollout attestations are incomplete', () => {
    const snapshot = buildTestSnapshot(
      enabledSeoRolloutState({
        crawlValidationPassed: false,
        searchConsoleValidationPassed: false,
      })
    )
    expect(snapshot.allowlist.indexingAllowed).toBe(true)
    expect(deriveSeoHealthState(snapshot)).toBe('ACTION_REQUIRED')
  })

  it('shows canonical warning when NEXT_PUBLIC_SITE_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    const summary = buildCanonicalSummary(undefined)
    expect(summary.usingFallback).toBe(true)
    expect(summary.effectiveCanonical).toBe('https://lootaura.app')
  })

  it('uses configured canonical when NEXT_PUBLIC_SITE_URL is set', () => {
    const summary = buildCanonicalSummary('https://lootaura.com')
    expect(summary.usingFallback).toBe(false)
    expect(summary.configuredEnv).toBe('https://lootaura.com')
  })

  it('listing footprint is binary with rollout state', () => {
    expect(buildListingFootprint(1248, true)).toEqual({
      published: 1248,
      indexable: 1248,
      noindex: 0,
    })
    expect(buildListingFootprint(1248, false)).toEqual({
      published: 1248,
      indexable: 0,
      noindex: 1248,
    })
  })

  it('formatSeoDiagnosticsText exports READY state accurately', () => {
    const dashboard = buildSeoOperationsDashboard({
      snapshot: buildTestSnapshot(enabledSeoRolloutState()),
      rolloutState: enabledSeoRolloutState(),
      publishedListingCount: 1248,
      configuredSiteUrl: 'https://lootaura.com',
    })
    const text = formatSeoDiagnosticsText(dashboard)
    expect(text).toContain('SEO HEALTH: READY')
    expect(text).toContain('Public Indexing: true')
    expect(text).toContain('Listings: INDEX')
    expect(text).toContain('Published: 1248')
    expect(text).toContain('Indexable: 1248')
  })

  it('never shows INDEX listings with zero indexable footprint when R is false', () => {
    const snapshot = buildTestSnapshot(
      enabledSeoRolloutState({
        crawlValidationPassed: false,
        searchConsoleValidationPassed: false,
      })
    )
    const dashboard = buildSeoOperationsDashboard({
      snapshot,
      rolloutState: snapshot.rollout.rolloutState,
      publishedListingCount: 1248,
      configuredSiteUrl: 'https://lootaura.com',
    })

    expect(snapshot.rollout.indexingAllowed).toBe(false)
    expect(dashboard.indexability.listings).toBe('NOINDEX')
    expect(dashboard.listingFootprint.indexable).toBe(0)
    expect(dashboard.listingFootprint.noindex).toBe(1248)
    expect(dashboard.sitemap.indexingEnabled).toBe(false)
  })

  it('formatSeoDiagnosticsText includes canonical warning when env missing', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    const dashboard = buildSeoOperationsDashboard({
      snapshot: buildTestSnapshot(SEO_ROLLOUT_DISABLED_STATE),
      rolloutState: SEO_ROLLOUT_DISABLED_STATE,
      publishedListingCount: 100,
      configuredSiteUrl: undefined,
    })
    const text = formatSeoDiagnosticsText(dashboard)
    expect(text).toContain('WARNING: Fallback canonical in use')
  })
})
