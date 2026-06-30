import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { PublishedNotVisibleDistributionDiscovery } from '@/lib/admin/publishedNotVisibleDistributionTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import { minimalYstmCoverageScoreboard } from '@/tests/unit/admin/evaluateYstmSaleInstanceRolloutGates.test'

export function diagnosticsV4Metrics(
  overrides: Partial<IngestionMetricsResponse> = {}
): IngestionMetricsResponse {
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
    generatedAt: '2026-06-17T12:00:00.000Z',
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
      publish: { oldestReadyAgeMs: null, readyCount: 10 },
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
          {
            id: 'discovered',
            label: 'Discovered',
            layer: 'crawler',
            count: 1000,
            conversionFromPrevious: null,
            conversionFromInserted: null,
            dropoffFromPrevious: 0,
          },
          {
            id: 'inserted',
            label: 'Inserted',
            layer: 'unique_listings',
            count: 50,
            conversionFromPrevious: null,
            conversionFromInserted: null,
            dropoffFromPrevious: 0,
          },
          {
            id: 'published',
            label: 'Published',
            layer: 'publishable',
            count: 40,
            conversionFromPrevious: null,
            conversionFromInserted: null,
            dropoffFromPrevious: 0,
          },
          {
            id: 'publish_failed',
            label: 'Publish failed',
            layer: 'publishable',
            count: 0,
            conversionFromPrevious: null,
            conversionFromInserted: null,
            dropoffFromPrevious: 0,
          },
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

export function diagnosticsV4Coverage(
  overrides: Partial<YstmCoverageMetricsResponse> = {}
): YstmCoverageMetricsResponse {
  return minimalYstmCoverageScoreboard(overrides)
}

export function publishedNotVisibleAudit(
  overrides: Partial<PublishedNotVisibleDistributionDiscovery> = {}
): PublishedNotVisibleDistributionDiscovery {
  return {
    generatedAt: '2026-06-17T12:00:00.000Z',
    analysis: {
      generatedAt: '2026-06-17T12:00:00.000Z',
      cohortTotal: 100,
      byBucket: {
        VISIBLE_SALE: 10,
        NO_MATCHED_SALE: 2,
        MISMATCH: 3,
        ARCHIVED: 1,
        MODERATION_HIDDEN: 0,
        EXPIRED: 1,
        STALE_OBSERVATION: 80,
        OTHER: 3,
      },
      byReconciliationClass: {},
      visibilityFilterZombieCount: 0,
      observationStaleTagCount: 80,
      publishHookCount: 0,
    },
    bucketRows: [],
    reconciliationRows: [],
    dominantBucket: 'STALE_OBSERVATION',
    dominantBucketPct: 0.8,
    dispositionSharePct: 0.07,
    staleSharePct: 0.8,
    matchingSharePct: 0.1,
    publishHookSharePct: 0,
    verdict: 'COVERAGE_VISIBILITY_AUDIT_BUG_V1',
    verdictRationale: 'test fixture',
    sampleRows: [],
    auditComplete: true,
    ...overrides,
  }
}

export function productionLikeMetrics(): IngestionMetricsResponse {
  return diagnosticsV4Metrics({
    published24h: 143,
    failureBreakdown: {
      needs_check: 207,
      publish_failed: 4,
      expired: 0,
      ready: 10,
      publishing: 0,
    },
    publishedNotVisibleDistributionAnalysis: publishedNotVisibleAudit({
      analysis: {
        generatedAt: '2026-06-30T03:02:53.864Z',
        cohortTotal: 3,
        byBucket: {
          VISIBLE_SALE: 0,
          NO_MATCHED_SALE: 0,
          MISMATCH: 3,
          ARCHIVED: 0,
          MODERATION_HIDDEN: 0,
          EXPIRED: 0,
          STALE_OBSERVATION: 0,
          OTHER: 0,
        },
        byReconciliationClass: {},
        visibilityFilterZombieCount: 0,
        observationStaleTagCount: 3,
        publishHookCount: 0,
      },
    }),
    volume: {
      ...diagnosticsV4Metrics().volume,
      fetch: {
        ...diagnosticsV4Metrics().volume.fetch,
        crawlSkipTaxonomy24h: {
          ...emptyCrawlSkipTaxonomyRollup(),
          total: 14_728,
          benign: 7_092,
          suspicious: 5_798,
          operational: 1_838,
        },
      },
      publish: {
        ...diagnosticsV4Metrics().volume.publish,
        publishSucceeded24h: 113,
        publishAttempted24h: 113,
      },
    },
    funnel: {
      ...diagnosticsV4Metrics().funnel,
      '24h': {
        ...diagnosticsV4Metrics().funnel['24h'],
        stages: diagnosticsV4Metrics()
          .funnel['24h'].stages.map((s) =>
            s.id === 'published' ? { ...s, count: 113 } : s
          ),
        detailFirst: {
          ...diagnosticsV4Metrics().funnel['24h'].detailFirst,
          attempted: 12_961,
          succeeded: 12_786,
          providerGeocodeBypassRate: 0.987,
        },
      },
    },
  })
}

export function productionLikeCoverage(): YstmCoverageMetricsResponse {
  return diagnosticsV4Coverage({
    coveragePct: 97,
    publishedActiveLootAuraYstmUrls: 275,
    catalogRepair: {
      ...diagnosticsV4Coverage().catalogRepair,
      repairQueueTotal: 106,
    },
    pipelineBacklog: {
      ...diagnosticsV4Coverage().pipelineBacklog,
      catalogRepairQueue: 106,
      existingRefreshStale: 31_697,
    },
    falseExclusionAudit: {
      ...diagnosticsV4Coverage().falseExclusionAudit,
      byPrimaryBucket: {
        ...diagnosticsV4Coverage().falseExclusionAudit.byPrimaryBucket,
        published_not_visible: 148,
      },
    },
    falseExclusionSaleIdentity: {
      ...diagnosticsV4Coverage().falseExclusionSaleIdentity,
      duplicateVisibleSaleClusters24h: 6,
    },
    saleInstanceShadowReplay: {
      ...diagnosticsV4Coverage().saleInstanceShadowReplay,
      divergenceOldSuppressNewPublishCount: 55,
    },
    crossProviderConvergence: {
      ...diagnosticsV4Coverage().crossProviderConvergence,
      sloAttainment: {
        requiredConsecutiveDays: 14,
        consecutiveZeroDuplicateDays: 2,
        latestDayQualifies: true,
        programComplete: false,
      },
    },
    canonicalSaleInstance: {
      ...diagnosticsV4Coverage().canonicalSaleInstance,
      canonicalCoveragePct: 92.8,
    },
    actionableMissingValid: {
      ...diagnosticsV4Coverage().actionableMissingValid!,
      effectiveMissingValidYstmUrls: 50,
    },
  })
}
