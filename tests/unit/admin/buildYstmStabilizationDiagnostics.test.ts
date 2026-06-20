import { describe, expect, it } from 'vitest'
import { buildYstmStabilizationDiagnostics } from '@/lib/admin/buildYstmStabilizationDiagnostics'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import { minimalYstmCoverageScoreboard } from './evaluateYstmSaleInstanceRolloutGates.test'

function minimalMetrics(): IngestionMetricsResponse {
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
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    detailFirstMetricsBaselineAt: '2026-01-01T00:00:00.000Z',
    detailFirstProof: evaluateDetailFirstProofProtocol({
      metricsBaselineAt: '2026-01-01T00:00:00.000Z',
      detailFirst,
    }),
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
    needsCheckRootCauseAnalysis: null,
    listFastFailureDistributionAnalysis: null,
    addressEnrichmentDrainCohort: null,
    terminalDisposition: null,
    timeseries: {} as IngestionMetricsResponse['timeseries'],
    orchestrationVisibility: {} as IngestionMetricsResponse['orchestrationVisibility'],
    volume: {
      bottleneck: 'fetch',
      geocode: { oldestNeedsGeocodeAgeMs: null },
      publish: { oldestReadyAgeMs: null },
      fetch: {
        configsOverdue: 0,
        crawlSkipTaxonomy24h: emptyCrawlSkipTaxonomyRollup(),
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
  } as unknown as IngestionMetricsResponse
}

describe('buildYstmStabilizationDiagnostics', () => {
  it('includes tier sections and hold note', () => {
    const text = buildYstmStabilizationDiagnostics(
      minimalMetrics(),
      minimalYstmCoverageScoreboard()
    )
    expect(text).toContain('## YSTM stabilization exit')
    expect(text).toContain('### Tier 1')
    expect(text).toContain('### Tier 2')
    expect(text).toContain('7 consecutive daily passes')
    expect(text).toMatch(/\[PASS\].*Coverage/)
  })
})
