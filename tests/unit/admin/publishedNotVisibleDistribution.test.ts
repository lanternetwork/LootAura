import { describe, expect, it } from 'vitest'

import { buildPublishedNotVisibleDistributionDiagnostics } from '@/lib/admin/buildPublishedNotVisibleDistributionDiagnostics'
import { evaluatePublishedNotVisibleDistribution } from '@/lib/admin/evaluatePublishedNotVisibleDistribution'
import {
  PUBLISHED_NOT_VISIBLE_BUCKETS,
  type PublishedNotVisibleDistributionAnalysis,
} from '@/lib/admin/publishedNotVisibleDistributionTypes'

function emptyBuckets(): PublishedNotVisibleDistributionAnalysis['byBucket'] {
  return Object.fromEntries(PUBLISHED_NOT_VISIBLE_BUCKETS.map((b) => [b, 0])) as PublishedNotVisibleDistributionAnalysis['byBucket']
}

describe('evaluatePublishedNotVisibleDistribution', () => {
  it('recommends disposition repair when archived and expired dominate', () => {
    const analysis: PublishedNotVisibleDistributionAnalysis = {
      generatedAt: '2026-06-22T00:00:00.000Z',
      cohortTotal: 654,
      byBucket: {
        ...emptyBuckets(),
        EXPIRED: 410,
        ARCHIVED: 180,
        MODERATION_HIDDEN: 63,
        STALE_OBSERVATION: 1,
      },
      byReconciliationClass: { VISIBILITY_FILTER: 653, STALE_OBSERVATION: 1 },
      visibilityFilterZombieCount: 653,
      observationStaleTagCount: 1,
      publishHookCount: 12,
    }

    const discovery = evaluatePublishedNotVisibleDistribution(analysis)
    expect(discovery.verdict).toBe('PUBLISHED_NOT_VISIBLE_DISPOSITION_REPAIR_V1')
    expect(discovery.dispositionSharePct).toBeCloseTo(653 / 654, 4)
  })

  it('flags audit bug when visible sale rows exist', () => {
    const analysis: PublishedNotVisibleDistributionAnalysis = {
      generatedAt: '2026-06-22T00:00:00.000Z',
      cohortTotal: 3,
      byBucket: {
        ...emptyBuckets(),
        VISIBLE_SALE: 1,
        EXPIRED: 2,
      },
      byReconciliationClass: { STALE_OBSERVATION: 1, VISIBILITY_FILTER: 2 },
      visibilityFilterZombieCount: 2,
      observationStaleTagCount: 1,
      publishHookCount: 0,
    }

    const discovery = evaluatePublishedNotVisibleDistribution(analysis)
    expect(discovery.verdict).toBe('COVERAGE_VISIBILITY_AUDIT_BUG_V1')
  })
})

describe('buildPublishedNotVisibleDistributionDiagnostics', () => {
  it('renders section headers for a non-empty audit', () => {
    const analysis: PublishedNotVisibleDistributionAnalysis = {
      generatedAt: '2026-06-22T00:00:00.000Z',
      cohortTotal: 4,
      byBucket: {
        ...emptyBuckets(),
        EXPIRED: 2,
        ARCHIVED: 1,
        STALE_OBSERVATION: 1,
      },
      byReconciliationClass: { VISIBILITY_FILTER: 3, STALE_OBSERVATION: 1 },
      visibilityFilterZombieCount: 3,
      observationStaleTagCount: 1,
      publishHookCount: 1,
    }

    const discovery = evaluatePublishedNotVisibleDistribution(analysis, [
      {
        canonicalUrl: 'https://www.yardsaletreasuremap.com/sale/a',
        bucket: 'EXPIRED',
        reconciliationClass: 'VISIBILITY_FILTER',
        visibilityFilterZombie: true,
        observationStaleTag: false,
        passesPhase4PublicVisibility: false,
        matchedSaleId: 'sale-a',
        matchedIngestedSaleId: null,
        ingestedSaleId: 'ing-1',
        ingestedPublishedSaleId: 'sale-a',
        saleId: 'sale-a',
        appearanceSource: 'publish_hook',
        matchMethod: 'url',
        secondaryTags: [],
        endsAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
        moderationStatus: null,
        saleStatus: 'published',
      },
    ])

    const markdown = buildPublishedNotVisibleDistributionDiagnostics(discovery)

    expect(markdown).toContain('## PUBLISHED_NOT_VISIBLE_DISTRIBUTION_V2')
    expect(markdown).toContain('### Section A — Cohort Summary')
    expect(markdown).toContain('### Section G — Verdict')
    expect(markdown).toContain('visibility_filter_zombie')
    expect(markdown).toContain('EXPIRED')
    expect(markdown).toContain('_No repairs implemented in this audit PR._')
  })
})
