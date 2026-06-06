import { describe, expect, it } from 'vitest'
import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'

function stage(id: string, count: number) {
  return {
    id: id as import('@/lib/admin/ingestionFunnelMetricsHelpers').IngestionFunnelStageId,
    label: id,
    layer: 'crawler' as const,
    count,
    conversionFromPrevious: null,
    conversionFromInserted: null,
    dropoffFromPrevious: 0,
  }
}

describe('buildIngestionDiagnostics', () => {
  it('formats markdown with explicit zeros and header lines', () => {
    const detailFirst = {
      attempted: 4,
      succeeded: 2,
      published: 1,
      fallback: 2,
      fetchFailed: 1,
      freshInsertReadyAtInsertRate: 0.13,
      medianMsToPublished: 420,
      providerGeocodeBypassRate: 0.5,
      fallbackByReason: {
        spatial_lookup_failed: 2,
        fetch_failed: 1,
      },
      topFallbackReason: 'spatial_lookup_failed',
      topFallbackReasonPct: 0.5,
      fallbackUnclassified: 0,
      fallbackReasonAccounted: 2,
      addressFromDetailPage: 3,
      addressFromListSeed: 1,
      addressFromDetailPageRate: 0.75,
      insertFailedByDbCode: { '23514': 1 },
      operationalHealth: { healthy: true, alerts: [] },
    }
    const data = {
      ok: true,
      generatedAt: '2026-05-18T12:00:00.000Z',
      detailFirstMetricsBaselineAt: '2026-05-18T06:00:00.000Z',
      detailFirstProof: evaluateDetailFirstProofProtocol({
        metricsBaselineAt: '2026-05-18T06:00:00.000Z',
        detailFirst,
      }),
      backlog: 0,
      geocodeEligibleBacklog: 0,
      published24h: 0,
      claimed24h: 0,
      geocodeTouches24h: 0,
      efficiency: null,
      failureBreakdown: {
        needs_check: 0,
        publish_failed: 0,
        expired: 0,
        ready: 0,
        publishing: 0,
      },
      needsCheckBreakdown: null,
      needsCheckRootCauseAnalysis: null,
      addressEnrichmentDrainCohort: null,
      timeseries: {} as IngestionMetricsResponse['timeseries'],
      orchestrationVisibility: {} as IngestionMetricsResponse['orchestrationVisibility'],
      volume: {
        bottleneck: 'none',
        hourlyRates: {
          sourcePagesFetchedPerHour: 0,
          configsProcessedPerHour: 0,
          listingsDiscoveredPerHour: 1.25,
          listingsInsertedPerHour: 2.5,
          listingsSkippedPerHour: 0,
          insertYieldPerHour: null,
          saturationRatePerHour: null,
          geocodeSucceededPerHour: 0,
          geocodeRetryableFailedPerHour: 0,
          geocodeTerminalFailedPerHour: 0,
          publishAttemptedPerHour: 0,
          publishSucceededPerHour: 3,
          publishFailedPerHour: 0,
          reconciliationProcessedPerHour: 0,
        },
        acquisition: {
          insertYield24h: 0,
          saturationRate24h: 0,
          enabledExternalConfigs: 0,
          crawlableConfigs: 5,
          configsSkippedNoSourcePages: 0,
          configsSkippedInvalidUrls: 0,
          saturatedConfigs: 0,
          configsWithRecentInsert: 0,
          avgConfigWindowInsertYield: null,
          pendingDiscoveryConfigs: 1,
          validatedDiscoveryConfigs: 4,
          manualDiscoveryConfigs: 0,
          failedDiscoveryConfigs: 0,
          discoveryFailureReasons: {},
        },
        fetch: {
          insertYield24h: 0,
          saturationRate24h: 0,
        } as IngestionMetricsResponse['volume']['fetch'],
        addressLifecycle: {
          byStatus: {},
          enrichmentBacklog: 0,
        },
        imageEnrichment: {} as IngestionMetricsResponse['volume']['imageEnrichment'],
        nativeCoordinateRemediation: {} as IngestionMetricsResponse['volume']['nativeCoordinateRemediation'],
        geocode: {
          needsGeocodeCount: 0,
          eligibleNeedsGeocodeCount: 0,
          oldestNeedsGeocodeAgeMs: null,
          geocodeSucceeded24h: 0,
          geocodeRetryableFailed24h: 0,
          geocodeTerminalFailed24h: 0,
          rate429Count24h: 0,
          effectiveConcurrencyLatest: null,
          replayableTransientNeedsCheck: 0,
          terminalGeocodeNeedsCheck: 0,
        },
        publish: {} as IngestionMetricsResponse['volume']['publish'],
        discovery: {} as IngestionMetricsResponse['volume']['discovery'],
        reconciliation: {} as IngestionMetricsResponse['volume']['reconciliation'],
      },
      funnel: {
        '24h': {
          windowHours: 24,
          stages: [
            stage('discovered', 100),
            stage('duplicate_skipped', 10),
            stage('skipped_expired', 0),
            stage('inserted', 20),
            stage('fresh_inserted', 15),
            stage('published', 12),
            stage('publish_failed', 0),
            stage('native_coord_found', 1),
            stage('native_coord_failed', 0),
            stage('geocode_success', 2),
            stage('geocode_failed', 0),
          ],
          topDropoff: null,
          reconciliation: {} as import('@/lib/admin/ingestionMetricsTypes').IngestionFunnelWindowMetrics['reconciliation'],
          uniqueCanonicalUrls: 0,
          duplicateHits: {} as import('@/lib/admin/ingestionMetricsTypes').IngestionFunnelWindowMetrics['duplicateHits'],
          freshRates: {} as import('@/lib/admin/ingestionMetricsTypes').IngestionFunnelWindowMetrics['freshRates'],
          skippedExpired: 5,
          freshInserted: 15,
          detailFirst,
          detailFirstCapture: {
            crawlerDiscovered: 100,
            duplicateSkipped: 10,
            freshInserted: 15,
            detailFirstAttempted: 4,
            detailFirstReady: 2,
            detailFirstPublished: 1,
            parserSuccessRate: 0.5,
            visibleCaptureRate: 0.15,
            visiblePublishRate: 0.01,
            parserToVisibleGapRate: 0.35,
            parserSloMetVisibleCaptureLow: false,
          },
          configLeaderboards: {
            topFreshYield: [],
            topStale: [],
            topDuplicate: [],
            topDetailFirstYield: [],
            topParserVisibleGap: [],
          },
          bySourcePlatform: {},
          ystm: {
            discovered: 50,
            duplicate_skipped: 5,
            inserted: 8,
            uniqueCanonicalUrls: 20,
            published: 6,
          },
          sparklines: {
            discoveredByHour: [],
            insertedByHour: [],
            publishedByHour: [],
          },
        },
        '7d': {} as import('@/lib/admin/ingestionMetricsTypes').IngestionFunnelWindowMetrics,
      },
      oldestStuckRows: [],
    } as unknown as IngestionMetricsResponse

    const md = buildIngestionDiagnostics(data, {
      environment: 'test-env',
      copiedAt: '2026-05-18T13:00:00.000Z',
    })

    expect(md).toContain('# Ingestion Diagnostics')
    expect(md).toContain('Timestamp: 2026-05-18T13:00:00.000Z')
    expect(md).toContain('Environment: test-env')
    expect(md).toContain('Current bottleneck: none')
    expect(md).toContain('- detail-first metrics baseline: 2026-05-18T06:00:00.000Z')
    expect(md).toContain('## Live backlog')
    expect(md).toContain('- ingested_sales backlog: 0')
    expect(md).toContain('## Phase G — crawl volume (parser vs visible capture)')
    expect(md).toContain('## Phase 3B proof protocol')
    expect(md).toContain('### Proof checklist')
    expect(md).toContain('- duplicate/skipped: 10')
    expect(md).toContain('- skipped expired: 5')
    expect(md).toContain('- fresh inserted: 15')
    expect(md).toContain('- detail-first success rate: 50.0% (target ≥90%)')
    expect(md).toContain('- attempted: 4')
    expect(md).toContain('- address from detail page: 3')
    expect(md).toContain('### Phase C insert_failed DB codes')
    expect(md).toContain('- 23514: 1 (25.0% of attempts)')
    expect(md).toContain('- operational health: healthy')
    expect(md).toContain('- fallback reasons accounted: 2/2')
    expect(md).toContain('- top fallback reason: spatial_lookup_failed (50.0% of attempts)')
    expect(md).toContain('- spatial_lookup_failed: 2 (50.0% of attempts)')
    expect(md).toContain('- fetch_failed: 1 (25.0% of attempts)')
    expect(md).toContain('- published/hour: 3')
    expect(md).toContain('- insert yield: 0.0%')
    expect(md).toContain('- saturation: 0.0%')
    expect(md).toContain('- geocode failed: 0')
    expect(md).toContain('- percentage: —')
  })

  it('appends YSTM coverage section when ystmCoverage is provided', () => {
    const detailFirst = {
      attempted: 0,
      succeeded: 0,
      published: 0,
      fallback: 0,
      fetchFailed: 0,
      freshInsertReadyAtInsertRate: null,
      medianMsToPublished: null,
      providerGeocodeBypassRate: null,
      fallbackByReason: {},
      topFallbackReason: null,
      topFallbackReasonPct: null,
      fallbackUnclassified: 0,
      fallbackReasonAccounted: 0,
      addressFromDetailPage: 0,
      addressFromListSeed: 0,
      addressFromDetailPageRate: null,
      insertFailedByDbCode: {},
      operationalHealth: { healthy: true, alerts: [] },
    }
    const data = {
      ok: true,
      generatedAt: '2026-05-22T00:00:00Z',
      detailFirstProof: evaluateDetailFirstProofProtocol({ metricsBaselineAt: null, detailFirst }),
      backlog: 0,
      geocodeEligibleBacklog: 0,
      published24h: 0,
      claimed24h: 0,
      geocodeTouches24h: 0,
      failureBreakdown: {
        needs_check: 0,
        publish_failed: 0,
        expired: 0,
        ready: 0,
        publishing: 0,
      },
      needsCheckBreakdown: null,
      needsCheckRootCauseAnalysis: null,
      addressEnrichmentDrainCohort: null,
      funnel: {
        '24h': {
          stages: [],
          skippedExpired: 0,
          freshInserted: 0,
          detailFirst,
          detailFirstCapture: {
            crawlerDiscovered: 0,
            detailFirstReady: 0,
            freshInserted: 0,
            parserSuccessRate: null,
            visibleCaptureRate: null,
            parserToVisibleGapRate: null,
            parserSloMetVisibleCaptureLow: false,
          },
          ystm: {
            discovered: 0,
            duplicate_skipped: 0,
            inserted: 0,
            uniqueCanonicalUrls: 0,
            published: 0,
          },
          topDropoff: null,
        },
        '7d': {} as IngestionMetricsResponse['funnel']['7d'],
      },
      volume: {
        bottleneck: 'none',
        hourlyRates: {
          sourcePagesFetchedPerHour: 0,
          configsProcessedPerHour: 0,
          listingsDiscoveredPerHour: 0,
          listingsInsertedPerHour: 0,
          listingsSkippedPerHour: 0,
          insertYieldPerHour: null,
          saturationRatePerHour: null,
          geocodeSucceededPerHour: 0,
          geocodeRetryableFailedPerHour: 0,
          geocodeTerminalFailedPerHour: 0,
          publishAttemptedPerHour: 0,
          publishSucceededPerHour: 0,
          publishFailedPerHour: 0,
          reconciliationProcessedPerHour: 0,
        },
        acquisition: {
          crawlableConfigs: 0,
          pendingDiscoveryConfigs: 0,
          validatedDiscoveryConfigs: 0,
        },
        fetch: { insertYield24h: 0, saturationRate24h: 0 },
        geocode: { needsGeocodeCount: 0, rate429Count24h: 0 },
        addressLifecycle: { enrichmentBacklog: 0 },
        imageEnrichment: { backlog: 0 },
      },
      timeseries: {} as IngestionMetricsResponse['timeseries'],
      orchestrationVisibility: {} as IngestionMetricsResponse['orchestrationVisibility'],
    } as unknown as IngestionMetricsResponse

    const ystmCoverage = {
      ok: true,
      targetPct: 90,
      generatedAt: '2026-05-22T00:00:00Z',
      validActiveYstmUrls: 78,
      missingValidYstmUrls: 7,
      publishedActiveLootAuraYstmUrls: 0,
      publishedVisibleInAuditFootprint: 71,
      coveragePct: 91,
      lastAuditAt: null,
      lastAuditStatus: null,
      observationFootprintUrls: 0,
      missingByState: {},
      missingByMetro: {},
      trend: [],
      lastRun: null,
      sourceExpansion: {
        generatedAt: '2026-05-22T00:00:00Z',
        enabledExternalConfigs: 0,
        crawlableConfigs: 62,
        configsSkippedNoSourcePages: 0,
        configsSkippedInvalidUrls: 0,
        configsSkippedCrawlExcluded: 0,
        pendingDiscoveryConfigs: 0,
        validatedDiscoveryConfigs: 0,
        failedDiscoveryConfigs: 0,
        saturatedConfigs: 0,
        configsWithRecentInsert: 0,
        configsWithoutSourcePages: 922,
      },
      missingIngestion: {
        missingQueueTotal: 7,
        missingIngestionAttempted: 0,
        missingIngestionPublished: 0,
        missingIngestionIngested: 0,
        missingIngestionFailed: 0,
        missingIngestionSkippedVisible: 0,
        missingIngestionSkippedExisting: 0,
        missingIngestionNeverAttempted: 3,
      },
      existingRefresh: {
        externalIngestedTotal: 0,
        ystmDetailIngestedTotal: 0,
        syncedLast24h: 0,
        neverSynced: 0,
        staleOver12h: 144,
      },
      catalogRepair: {
        repairQueueTotal: 269,
        needsGeocode: 0,
        readyUnpublished: 0,
        publishFailed: 0,
        needsCheck: 0,
        repairedPublishedLast24h: 0,
        repairFailed: 0,
      },
      pipelineBacklog: {
        missingValidUrls: 7,
        missingIngestionQueue: 7,
        missingIngestionNeverAttempted: 3,
        catalogRepairQueue: 269,
        existingRefreshStale: 144,
      },
      sloAttainment: {
        consecutiveDaysAtTarget: 1,
        requiredConsecutiveDays: 14,
        programMinFootprint: 5000,
        footprintMeetsProgramMinimum: false,
        latestDayQualifies: false,
        programComplete: false,
      },
      graphEnumeration: {
        generatedAt: '2026-05-22T00:00:00Z',
        catalogStates: 51,
        statesWithCandidates: 0,
        statesRemaining: 51,
        candidatesDiscovered: 0,
        validatedPages: 0,
        pendingValidation: 0,
        invalidPagesByStatus: {},
        promotedCandidates: 0,
        configsPromotedLastRun: 0,
        validationsLast24h: 0,
        fetchFailureRate24h: 0,
        blockRate24h: 0,
        throttleRecommended: false,
        lastDiscoveryRun: null,
        sourceExpansion: {
          generatedAt: '2026-05-22T00:00:00Z',
          enabledExternalConfigs: 0,
          crawlableConfigs: 62,
          configsSkippedNoSourcePages: 0,
          configsSkippedInvalidUrls: 0,
          configsSkippedCrawlExcluded: 0,
          pendingDiscoveryConfigs: 0,
          validatedDiscoveryConfigs: 0,
          failedDiscoveryConfigs: 0,
          saturatedConfigs: 0,
          configsWithRecentInsert: 0,
          configsWithoutSourcePages: 922,
        },
      },
      operationalHealth: { healthy: true, alerts: [] },
      falseExclusionAudit: {
        generatedAt: '2026-05-22T00:00:00Z',
        missingValidCount: 7,
        tracedCount: 7,
        byPrimaryBucket: {
          never_crawled: 0,
          crawl_not_yet_rotated: 3,
          url_duplicate_suppressed: 1,
          url_reuse_suspected: 0,
          soft_dedupe_suppressed: 0,
          expired_false_positive: 0,
          gated_false_positive: 0,
          detail_first_fallback: 1,
          address_validation_failed: 0,
          spatial_lookup_failed: 0,
          insert_failed: 0,
          publish_failed: 1,
          repair_pending: 1,
          repair_failed: 0,
          published_not_visible: 0,
          unknown: 0,
        },
        traces: [],
      },
      saleInstanceIdentity: {
        ystmRowsWithKey: 120,
        ystmActiveRowsWithKey: 95,
        keyCollisionGroups: 2,
        sampleCollisionKeys: ['external_page_source:TX|austin|addr:2026-05-10|2026-05-12:123'],
      },
      crossProviderShadow: {
        shadowRecords24h: 0,
        falseNegativeCount24h: 0,
        falseNegativeCount7d: 0,
        wouldLinkCount24h: 0,
        wouldSuppressPublishCount24h: 0,
        wouldPublishDistinctCount24h: 0,
        lastRecordedAt: null,
      },
      crossProviderConvergence: {
        duplicatePublishedCanonicalClusters: 0,
        observationPublished24h: 0,
        crossProviderShadowMatches24h: 0,
        publishLinkRate24h: null,
        ambiguousDispositionCount7d: 0,
        ambiguousDispositionShare7d: null,
        sloAttainment: {
          requiredConsecutiveDays: 14,
          consecutiveZeroDuplicateDays: 0,
          latestDayQualifies: false,
          programComplete: false,
        },
        sloTrend: [],
      },
      canonicalSaleInstance: {
        externalRowsWithCanonicalKey: 100,
        externalActiveRowsWithCanonicalKey: 90,
        externalPublishedActiveWithCanonicalKey: 80,
        externalActiveEligible: 95,
        canonicalCoveragePct: 94.7,
        canonicalCollisionGroups: 1,
        crossProviderCanonicalGroups: 0,
        sampleCrossProviderCanonicalKeys: [],
      },
      sourceUrlAlias: { totalAliasRows: 42 },
      saleInstanceShadowReplay: {
        generatedAt: '2026-05-22T00:00:00Z',
        replayedCount: 7,
        oldSuppressCount: 4,
        newSuppressCount: 1,
        wouldPublishCount: 3,
        divergenceOldSuppressNewPublishCount: 2,
        ambiguousCount: 0,
        sampleDivergences: [],
      },
      falseExclusionSaleIdentity: {
        generatedAt: '2026-05-22T00:00:00Z',
        missingValidYstmUrls: 7,
        missingNeverAttempted: 3,
        urlMatchSameDates: 0,
        urlMatchDatesChanged: 0,
        urlReuseDetected: 0,
        newEventSameUrl: 0,
        sameEventUpdated: 0,
        softDedupeSuppressed: 0,
        suspiciousSuppressions: 0,
        ambiguousRequiresReview: 0,
        saleInstanceKeyCollisions: 2,
        duplicateVisibleSaleClusters24h: 0,
        duplicateVisibleSameAddressDate24h: 0,
        coverageMatchMethodCounts: { sale_instance_key: 71 },
        coverageWithoutMatchMethod: 7,
        crawlSkipTaxonomy24h: emptyCrawlSkipTaxonomyRollup(),
        healthy: true,
        alerts: [],
      },
      coverageBootstrap: {
        enabled: false,
        enabledAt: null,
        disabledAt: null,
        disabledReason: null,
        exitCriteriaPreview: { met: false, reasons: [] },
      },
      esnetIngest: {
        enabled: false,
        enabledAt: null,
        disabledAt: null,
        disabledReason: null,
        crawlableConfigCount: 0,
        ingestMinIntervalMinutes: 360,
      },
      esnetBootstrap: {
        enabled: false,
        enabledAt: null,
        disabledAt: null,
        disabledReason: null,
        exitCriteriaPreview: { met: false, reasons: [] },
      },
    } as YstmCoverageMetricsResponse

    const md = buildIngestionDiagnostics(data, { ystmCoverage })
    expect(md).toContain('## External marketplace nationwide coverage')
    expect(md).toContain('### Sale-instance identity (Phase 3)')
    expect(md).toContain('### Source URL alias history (Phase 4)')
    expect(md).toContain('### Sale-instance shadow replay (Phase 9)')
    expect(md).toContain('### External source false exclusion / sale identity (Phase 13)')
    expect(md).toContain('### Sale-instance rollout gates (Phase 14)')
    expect(md).toContain('### False-exclusion audit (Phase 1)')
    expect(md).toContain('### Week-1 sprint gates')
    expect(md).toContain('## YSTM ingestion repair program')
  })
})
