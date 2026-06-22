import { describe, expect, it } from 'vitest'
import {
  buildCoverageBootstrapAdvisories,
  buildFunnelSnapshot,
  buildOperationalPriorities,
  deriveEffectiveBottleneck,
  deriveIngestionHealthState,
  isTier1InterventionRequired,
} from '@/lib/admin/ingestionDashboardOverview'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { minimalYstmCoverageScoreboard } from '@/tests/unit/admin/evaluateYstmSaleInstanceRolloutGates.test'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'

function minimalMetrics(overrides: Partial<IngestionMetricsResponse> = {}): IngestionMetricsResponse {
  const detailFirst = {
    attempted: 100,
    succeeded: 95,
    published: 80,
    fallback: 5,
    fetchFailed: 0,
    freshInsertReadyAtInsertRate: 0.9,
    medianMsToPublished: 500,
    providerGeocodeBypassRate: 0.95,
    fallbackByReason: {},
    topFallbackReason: null,
    topFallbackReasonPct: null,
    fallbackUnclassified: 0,
    fallbackReasonAccounted: 5,
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
    backlog: 2,
    geocodeEligibleBacklog: 2,
    published24h: 100,
    claimed24h: 0,
    geocodeTouches24h: 10,
    efficiency: 0.8,
    failureBreakdown: {
      needs_check: 5,
      publish_failed: 0,
      expired: 0,
      ready: 10,
      publishing: 0,
    },
    needsCheckBreakdown: null,
    needsCheckRootCauseAnalysis: null,
    listFastFailureDistributionAnalysis: null,
    publishedNotVisibleDistributionAnalysis: null,
    addressEnrichmentDrainCohort: null,
    terminalDisposition: null,
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
      bottleneck: 'publish',
      hourlyRates: { listingsInsertedPerHour: 10 },
      geocode: {
        needsGeocodeCount: 2,
        eligibleNeedsGeocodeCount: 2,
        oldestNeedsGeocodeAgeMs: null,
        rate429Count24h: 0,
      },
      publish: { oldestReadyAgeMs: null },
      fetch: {
        configsOverdue: 0,
        insertYield24h: 0.02,
        saturationRate24h: 0.1,
        crawlSkipTaxonomy24h: emptyCrawlSkipTaxonomyRollup(),
      },
      acquisition: {
        crawlableConfigs: 100,
        saturatedConfigs: 10,
        validatedDiscoveryConfigs: 50,
        manualDiscoveryConfigs: 0,
        pendingDiscoveryConfigs: 0,
      },
      addressLifecycle: {
        enrichmentBacklog: 5,
        byStatus: {},
      },
      imageEnrichment: { backlog: 0, hasImage: 0, attempted24h: 0, byFailureReason: {} },
    },
    funnel: {
      '24h': {
        stages: [
          { id: 'discovered', label: 'Discovered', layer: 'crawler', count: 1000, conversionFromPrevious: null, conversionFromInserted: null, dropoffFromPrevious: 0 },
          { id: 'inserted', label: 'Inserted', layer: 'unique_listings', count: 50, conversionFromPrevious: null, conversionFromInserted: null, dropoffFromPrevious: 0 },
          { id: 'published', label: 'Published', layer: 'publishable', count: 40, conversionFromPrevious: null, conversionFromInserted: null, dropoffFromPrevious: 0 },
          { id: 'publish_failed', label: 'Publish failed', layer: 'publishable', count: 0, conversionFromPrevious: null, conversionFromInserted: null, dropoffFromPrevious: 0 },
        ],
        freshInserted: 50,
        skippedExpired: 100,
        topDropoff: {
          fromStageId: 'discovered',
          toStageId: 'duplicate_skipped',
          count: 800,
          rate: 0.8,
        },
        detailFirst,
        detailFirstCapture: {
          crawlerDiscovered: 1000,
          detailFirstReady: 950,
          freshInserted: 50,
          duplicateSkipped: 800,
          parserSuccessRate: 0.95,
          visibleCaptureRate: 0.05,
          parserToVisibleGapRate: 0.9,
          parserSloMetVisibleCaptureLow: true,
        },
        ystm: { inserted: 50, published: 40, uniqueCanonicalUrls: 50 },
        configLeaderboards: {
          topFreshYield: [],
          topStale: [],
          topDuplicate: [],
          topDetailFirstYield: [],
          topParserVisibleGap: [],
        },
        reconciliation: { sourceUrl: 0, exactAddressDate: 0, softDateWindow: 0 },
        duplicateHits: {
          source_url: 0,
          exact_address_date: 0,
          soft_date_window: 0,
          duplicate_decision_true: 0,
          duplicate_existing_url: 0,
          duplicate_cross_city_page: 0,
        },
        freshRates: { freshInsertRate: 0.05, freshPublishRate: 0.04 },
        reach: {
          published: 40,
          publish_failed: 0,
          expired_at_insert: 0,
          ready: 10,
          geocode_failed: 0,
          native_coord_failed: 0,
          address_gated: 0,
          invalid_address: 0,
          native_coord_found: 0,
          geocode_success: 0,
          in_pipeline: 0,
        },
        partition: {
          published: 40,
          publish_failed: 0,
          expired_at_insert: 0,
          ready: 10,
          geocode_failed: 0,
          native_coord_failed: 0,
          address_gated: 0,
          invalid_address: 0,
          native_coord_found: 0,
          geocode_success: 0,
          in_pipeline: 0,
        },
      },
      '7d': {} as IngestionMetricsResponse['funnel']['7d'],
    },
    oldestStuckRows: [],
    ...overrides,
  } as IngestionMetricsResponse
}

describe('ingestionDashboardOverview', () => {
  it('builds funnel snapshot from 24h stages', () => {
    const snap = buildFunnelSnapshot(minimalMetrics())
    expect(snap.discovered).toBe(1000)
    expect(snap.published).toBe(40)
    expect(snap.topDropoffCount).toBe(800)
  })

  it('uses providerGeocodeBypassRate for detail-first success priority', () => {
    const metrics = minimalMetrics({
      funnel: {
        ...minimalMetrics().funnel,
        '24h': {
          ...minimalMetrics().funnel['24h'],
          detailFirst: {
            ...minimalMetrics().funnel['24h'].detailFirst,
            providerGeocodeBypassRate: 0.5,
          },
        },
      },
    })
    const priorities = buildOperationalPriorities(metrics, null)
    expect(priorities.some((p) => p.issue.includes('Detail-first success rate'))).toBe(true)
  })

  it('marks blocked when duplicate canonical clusters present', () => {
    const coverage = minimalYstmCoverageScoreboard({
      crossProviderConvergence: {
        ...minimalYstmCoverageScoreboard().crossProviderConvergence,
        duplicatePublishedCanonicalClusters: 1,
      },
    })
    const metrics = minimalMetrics()
    expect(deriveIngestionHealthState(metrics, coverage)).toBe('blocked')
    expect(isTier1InterventionRequired(metrics, coverage)).toBe(true)
  })

  it('uses catalog repair as effective bottleneck when geocode queue is low', () => {
    const metrics = minimalMetrics({
      geocodeEligibleBacklog: 2,
      volume: {
        ...minimalMetrics().volume,
        bottleneck: 'geocode',
        geocode: { ...minimalMetrics().volume.geocode, eligibleNeedsGeocodeCount: 2 },
      },
    })
    const effective = deriveEffectiveBottleneck(
      metrics,
      minimalYstmCoverageScoreboard({
        catalogRepair: { ...minimalYstmCoverageScoreboard().catalogRepair, repairQueueTotal: 274 },
        pipelineBacklog: {
          ...minimalYstmCoverageScoreboard().pipelineBacklog,
          catalogRepairQueue: 274,
        },
      })
    )
    expect(effective.id).toBe('catalog_repair')
    expect(effective.label).toBe('Catalog repair')
  })

  it('emits bootstrap advisory when V grows and coverage falls', () => {
    const advisories = buildCoverageBootstrapAdvisories(
      minimalYstmCoverageScoreboard({
        coverageBootstrap: {
          ...minimalYstmCoverageScoreboard().coverageBootstrap,
          enabled: true,
        },
        coveragePct: 79,
        trend: [
          {
            completedAt: '2026-05-26T15:00:00Z',
            coveragePct: 81,
            validActiveYstmUrls: 1018,
            publishedVisibleInAudit: 825,
          },
          {
            completedAt: '2026-05-26T21:00:00Z',
            coveragePct: 79,
            validActiveYstmUrls: 1122,
            publishedVisibleInAudit: 890,
          },
        ],
      })
    )
    expect(advisories.some((a) => a.includes('V) grew'))).toBe(true)
  })

  it('surfaces publish_failed in operational priorities', () => {
    const metrics = minimalMetrics({
      failureBreakdown: {
        needs_check: 0,
        publish_failed: 12,
        expired: 0,
        ready: 0,
        publishing: 0,
      },
    })
    const priorities = buildOperationalPriorities(metrics, null)
    expect(priorities.some((p) => p.issue.includes('publish_failed'))).toBe(true)
  })

  it('uses providerGeocodeBypassRate for detail-first priority when present', () => {
    const metrics = minimalMetrics({
      funnel: {
        ...minimalMetrics().funnel,
        '24h': {
          ...minimalMetrics().funnel['24h'],
          detailFirst: {
            ...minimalMetrics().funnel['24h'].detailFirst,
            attempted: 100,
            succeeded: 99,
            providerGeocodeBypassRate: 0.5,
          },
        },
      },
    })
    const priorities = buildOperationalPriorities(metrics, null)
    expect(priorities.some((p) => p.issue.includes('Detail-first success rate'))).toBe(true)
    expect(priorities.some((p) => p.issue.includes('50.0%'))).toBe(true)
  })
})
