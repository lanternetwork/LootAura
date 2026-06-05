import { describe, expect, it } from 'vitest'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import { evaluateYstmStabilizationExit } from '@/lib/admin/ystmStabilizationExitCriteria'
import { minimalYstmCoverageScoreboard } from './evaluateYstmSaleInstanceRolloutGates.test'

export function minimalMetrics(overrides: Partial<IngestionMetricsResponse> = {}): IngestionMetricsResponse {
  const detailFirst = {
    attempted: 100,
    succeeded: 100,
    published: 80,
    fallback: 0,
    fetchFailed: 0,
    freshInsertReadyAtInsertRate: 0.9,
    medianMsToPublished: 500,
    providerGeocodeBypassRate: 0.996,
    fallbackByReason: {},
    topFallbackReason: null,
    topFallbackReasonPct: null,
    fallbackUnclassified: 0,
    fallbackReasonAccounted: 0,
    addressFromDetailPage: 90,
    addressFromListSeed: 0,
    addressFromDetailPageRate: 0.9,
    operationalHealth: { healthy: true, alerts: [] },
  }
  const proof = evaluateDetailFirstProofProtocol({
    metricsBaselineAt: '2026-01-01T00:00:00.000Z',
    detailFirst,
  })
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    detailFirstMetricsBaselineAt: '2026-01-01T00:00:00.000Z',
    detailFirstProof: proof,
    backlog: 0,
    geocodeEligibleBacklog: 0,
    published24h: 10,
    claimed24h: 0,
    geocodeTouches24h: 0,
    efficiency: 1,
    failureBreakdown: {
      needs_check: 0,
      publish_failed: 0,
      expired: 0,
      ready: 0,
      publishing: 0,
    },
    needsCheckBreakdown: null,
    timeseries: {
      publishedByHour: [],
      ingestedPublishedByHour: [],
      durationMsByHour: [],
      rate429ByHour: [],
      claimedByHour: [],
      geocodeSuccessByHour: [],
      publishSuccessByHour: [],
      publishExpiredByHour: [],
      sourcePagesFetchedByHour: [],
      configsProcessedByHour: [],
      listingsInsertedByHour: [],
      listingsSkippedByHour: [],
      insertYieldByHour: [],
      saturationRateByHour: [],
      publishFailedByHour: [],
      geocodeRetryableFailedByHour: [],
    },
    orchestrationVisibility: {
      lockSkippedRuns48h: 0,
      budgetExitRuns48h: 0,
      overlapPreventionEvents48h: 0,
      adaptiveLatest: null,
      laneModeEnabled: false,
      lanes: [],
    },
    volume: {
      bottleneck: 'fetch',
      geocode: { oldestNeedsGeocodeAgeMs: null },
      publish: { oldestReadyAgeMs: null },
      fetch: {
        configsOverdue: 0,
        crawlSkipTaxonomy24h: emptyCrawlSkipTaxonomyRollup(),
      },
      addressLifecycle: {
        byStatus: {},
        enrichmentBacklog: 0,
      },
    },
    funnel: {
      '24h': {
        detailFirst,
        stages: {},
        reach: {} as never,
        partition: {} as never,
      },
      '7d': {} as never,
    },
    oldestStuckRows: [],
    ...overrides,
  } as IngestionMetricsResponse
}

describe('evaluateYstmStabilizationExit', () => {
  it('marks tier1 ready when all tier1 criteria pass', () => {
    const snap = evaluateYstmStabilizationExit(minimalMetrics(), minimalYstmCoverageScoreboard())
    expect(snap.tier1Ready).toBe(true)
    expect(snap.tier1Criteria.every((c) => c.status === 'pass')).toBe(true)
  })

  it('fails tier1 when duplicate canonical clusters are present', () => {
    const snap = evaluateYstmStabilizationExit(
      minimalMetrics(),
      minimalYstmCoverageScoreboard({
        crossProviderConvergence: {
          ...minimalYstmCoverageScoreboard().crossProviderConvergence,
          duplicatePublishedCanonicalClusters: 3,
        },
      })
    )
    expect(snap.tier1Ready).toBe(false)
    expect(snap.tier1Criteria.find((c) => c.id === 'duplicate_clusters')?.status).toBe('fail')
  })

  it('includes 7-day hold note', () => {
    const snap = evaluateYstmStabilizationExit(minimalMetrics(), null)
    expect(snap.holdNote).toContain('7')
    expect(snap.holdNote).toContain('snapshot')
  })
})
