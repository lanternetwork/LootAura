import { describe, expect, it } from 'vitest'
import { buildIngestionDiagnosticCopyV1Sections } from '@/lib/admin/buildIngestionDiagnosticCopyV1Sections'
import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import { minimalYstmDiscoveryFreshnessMetrics } from '@/tests/unit/admin/minimalYstmDiscoveryFreshnessMetrics'

function minimalDetailFirst() {
  return {
    attempted: 100,
    succeeded: 95,
    published: 90,
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
    addressFromDetailPage: 80,
    addressFromListSeed: 0,
    addressFromDetailPageRate: 0.8,
    insertFailedByDbCode: {},
    operationalHealth: { healthy: true, alerts: [] },
  }
}

function minimalMetrics(
  overrides: Partial<IngestionMetricsResponse> = {}
): IngestionMetricsResponse {
  const detailFirst = minimalDetailFirst()
  return {
    ok: true,
    generatedAt: '2026-06-17T10:00:00Z',
    detailFirstProof: evaluateDetailFirstProofProtocol({
      metricsBaselineAt: '2026-05-22T01:28:57.196+00:00',
      detailFirst,
    }),
    backlog: 1,
    geocodeEligibleBacklog: 1,
    published24h: 96,
    claimed24h: 0,
    geocodeTouches24h: 0,
    failureBreakdown: {
      needs_check: 802,
      publish_failed: 4,
      expired: 0,
      ready: 0,
      publishing: 0,
    },
    needsCheckBreakdown: null,
    needsCheckRootCauseAnalysis: {
      total: 802,
      scanned: 802,
      byBlockerCategory: {
        address_enrichment_retryable: 777,
        address_enrichment_terminal: 0,
        address_gated: 1,
        precision_gated: 0,
        geocode_blocked: 8,
        publish_eligible_today: 0,
        other: 16,
      },
      byAgeBucket: { under_7d: 436, '7_to_30d': 364, over_30d: 2 },
      byPublishability: {
        blocked_by_enrichment: 778,
        blocked_by_other: 16,
        blocked_by_geocode: 8,
      },
      failureSignals: {},
      allPairs: [],
    },
    addressEnrichmentDrainCohort: {
      cohortKey: 'address_enrichment_pending_x_provider_native',
      total: 178,
      scanned: 178,
      byClassification: {
        waiting: 175,
        eligible_now: 0,
        stalled: 1,
        exhausted: 2,
        unclassified: 0,
      },
      byFailureSubtype: {
        parse_no_address: 1,
        still_gated: 0,
        not_found: 0,
        fetch_failure: 0,
        blocked_html: 0,
        captcha: 0,
        claim_ineligible: 5,
        never_attempted: 170,
        max_attempts_exceeded: 2,
        other: 0,
      },
      dominantFailureSubtype: 'never_attempted',
    },
    funnel: {
      '24h': {
        stages: [],
        skippedExpired: 0,
        freshInserted: 96,
        detailFirst,
        detailFirstCapture: {
          crawlerDiscovered: 8617,
          detailFirstReady: 8360,
          freshInserted: 96,
          parserSuccessRate: 0.994,
          visibleCaptureRate: 0.011,
          parserToVisibleGapRate: 0.983,
          parserSloMetVisibleCaptureLow: false,
        },
        ystm: {
          discovered: 8617,
          duplicate_skipped: 207,
          inserted: 118,
          uniqueCanonicalUrls: 118,
          published: 96,
        },
        topDropoff: null,
      },
      '7d': {} as IngestionMetricsResponse['funnel']['7d'],
    },
    volume: {
      bottleneck: 'fetch',
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
        crawlableConfigs: 924,
        pendingDiscoveryConfigs: 0,
        validatedDiscoveryConfigs: 887,
      },
      fetch: { insertYield24h: 0.011, saturationRate24h: 0.024, crawlSkipTaxonomy24h: emptyCrawlSkipTaxonomyRollup() },
      geocode: { needsGeocodeCount: 1, rate429Count24h: 0 },
      addressLifecycle: { enrichmentBacklog: 213 },
      imageEnrichment: { backlog: 24 },
    },
    timeseries: {} as IngestionMetricsResponse['timeseries'],
    orchestrationVisibility: {} as IngestionMetricsResponse['orchestrationVisibility'],
    ...overrides,
  } as unknown as IngestionMetricsResponse
}

function minimalCoverage(): YstmCoverageMetricsResponse {
  return {
    ok: true,
    targetPct: 90,
    generatedAt: '2026-06-17T10:19:29.822Z',
    validActiveYstmUrls: 5269,
    missingValidYstmUrls: 538,
    publishedActiveLootAuraYstmUrls: 685,
    publishedVisibleInAuditFootprint: 4731,
    coveragePct: 89.8,
    lastAuditAt: '2026-06-16T15:01:18.422+00:00',
    lastAuditStatus: 'ok',
    observationFootprintUrls: 0,
    missingByState: { TX: 40, MA: 22 },
    missingByMetro: { 'phoenix-az': 30, 'boston-ma': 18 },
    trend: [],
    lastRun: null,
    sourceExpansion: {
      generatedAt: '2026-06-17T10:19:29.822Z',
      enabledExternalConfigs: 0,
      crawlableConfigs: 924,
      configsSkippedNoSourcePages: 0,
      configsSkippedInvalidUrls: 0,
      configsSkippedCrawlExcluded: 0,
      pendingDiscoveryConfigs: 0,
      validatedDiscoveryConfigs: 887,
      failedDiscoveryConfigs: 0,
      saturatedConfigs: 0,
      configsWithRecentInsert: 0,
      configsWithoutSourcePages: 500,
    },
    missingIngestion: {} as YstmCoverageMetricsResponse['missingIngestion'],
    existingRefresh: { staleOver12h: 22332 } as YstmCoverageMetricsResponse['existingRefresh'],
    catalogRepair: {
      repairQueueTotal: 805,
      needsGeocode: 1,
      readyUnpublished: 0,
      publishFailed: 4,
      needsCheck: 802,
      repairedPublishedLast24h: 96,
      repairFailed: 1,
    },
    pipelineBacklog: {
      catalogRepairQueue: 805,
      missingValidUrls: 538,
      missingIngestionQueue: 0,
      missingIngestionNeverAttempted: 0,
      existingRefreshStale: 22332,
    },
    sloAttainment: {
      consecutiveDaysAtTarget: 0,
      requiredConsecutiveDays: 14,
      programMinFootprint: 5000,
      footprintMeetsProgramMinimum: true,
      latestDayQualifies: false,
      programComplete: false,
    },
    graphEnumeration: {
      generatedAt: '2026-06-17T10:19:29.822Z',
      catalogStates: 51,
      statesWithCandidates: 40,
      statesRemaining: 11,
      candidatesDiscovered: 1200,
      validatedPages: 900,
      pendingValidation: 50,
      invalidPagesByStatus: {},
      promotedCandidates: 100,
      configsPromotedLastRun: 5,
      validationsLast24h: 20,
      fetchFailureRate24h: 0.02,
      blockRate24h: 0.01,
      throttleRecommended: false,
      lastDiscoveryRun: {
        completedAt: '2026-06-17T09:00:00Z',
        ok: true,
        skipped: false,
        skipReason: null,
        catalogSize: 51,
        stateBatchPlanned: 10,
        statesScanned: 8,
        configsPromoted: 5,
        phasesCompleted: ['graph_enumeration', 'placeholder_repair'],
        degraded: false,
        graphEnumerationThrottled: false,
      },
      sourceExpansion: {
        generatedAt: '2026-06-17T10:19:29.822Z',
        enabledExternalConfigs: 0,
        crawlableConfigs: 924,
        configsSkippedNoSourcePages: 0,
        configsSkippedInvalidUrls: 0,
        configsSkippedCrawlExcluded: 0,
        pendingDiscoveryConfigs: 0,
        validatedDiscoveryConfigs: 887,
        failedDiscoveryConfigs: 0,
        saturatedConfigs: 0,
        configsWithRecentInsert: 0,
        configsWithoutSourcePages: 500,
      },
    },
    operationalHealth: { healthy: false, alerts: [] },
    falseExclusionAudit: {
      generatedAt: '2026-06-17T10:19:29.822Z',
      missingValidCount: 538,
      tracedCount: 538,
      byPrimaryBucket: {
        never_crawled: 0,
        crawl_not_yet_rotated: 0,
        url_duplicate_suppressed: 0,
        url_reuse_suspected: 0,
        soft_dedupe_suppressed: 0,
        expired_false_positive: 0,
        gated_false_positive: 0,
        detail_first_fallback: 0,
        address_validation_failed: 0,
        spatial_lookup_failed: 0,
        insert_failed: 0,
        publish_failed: 0,
        repair_pending: 293,
        repair_failed: 0,
        published_not_visible: 162,
        unknown: 0,
      },
      traces: [],
    },
    saleInstanceIdentity: {
      ystmActiveRowsWithKey: 685,
      ystmRowsWithKey: 700,
      keyCollisionGroups: 0,
      sampleCollisionKeys: [],
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
        consecutiveZeroDuplicateDays: 8,
        latestDayQualifies: true,
        programComplete: false,
      },
      sloTrend: [],
    },
    canonicalSaleInstance: {
      externalRowsWithCanonicalKey: 600,
      externalActiveRowsWithCanonicalKey: 550,
      externalPublishedActiveWithCanonicalKey: 500,
      externalActiveEligible: 580,
      canonicalCoveragePct: 90.1,
      canonicalCollisionGroups: 0,
      crossProviderCanonicalGroups: 0,
      sampleCrossProviderCanonicalKeys: [],
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
    sourceUrlAlias: { totalAliasRows: 0 },
    saleInstanceShadowReplay: {
      generatedAt: '2026-06-17T10:00:00Z',
      replayedCount: 538,
      oldSuppressCount: 526,
      newSuppressCount: 358,
      wouldPublishCount: 180,
      divergenceOldSuppressNewPublishCount: 168,
      ambiguousCount: 0,
      sampleDivergences: [],
    } as unknown as YstmCoverageMetricsResponse['saleInstanceShadowReplay'],
    falseExclusionSaleIdentity: {
      generatedAt: '2026-06-17T10:19:29.822Z',
      missingValidYstmUrls: 538,
      missingNeverAttempted: 0,
      urlMatchSameDates: 0,
      urlMatchDatesChanged: 0,
      urlReuseDetected: 0,
      newEventSameUrl: 0,
      sameEventUpdated: 0,
      softDedupeSuppressed: 0,
      suspiciousSuppressions: 0,
      ambiguousRequiresReview: 0,
      saleInstanceKeyCollisions: 0,
      duplicateVisibleSaleClusters24h: 8,
      duplicateVisibleSameAddressDate24h: 0,
      coverageMatchMethodCounts: { sale_instance_key: 4000 },
      coverageWithoutMatchMethod: 1652,
      crawlSkipTaxonomy24h: emptyCrawlSkipTaxonomyRollup(),
      healthy: false,
      alerts: [],
    },
    coverageBootstrap: {
      enabled: true,
      enabledAt: '2026-05-24T20:12:03.068+00:00',
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
    discoveryFreshness: minimalYstmDiscoveryFreshnessMetrics({
      discoveryLatencyHours: { p50: 2, p90: 3.5, p95: 5, sampleCount: 120 },
      publishLatencyHours: { p50: 2.5, p90: 4, p95: 6, sampleCount: 80 },
      telemetryCompletenessPct: 92,
      velocityPoolCounts: { HOT: 10, WARM: 40, COLD: 874 },
    }),
  } as unknown as YstmCoverageMetricsResponse
}

describe('buildIngestionDiagnosticCopyV1Sections', () => {
  it('emits sections A–I in order when coverage is available', () => {
    const md = buildIngestionDiagnosticCopyV1Sections(minimalMetrics(), minimalCoverage()).join('\n\n')
    const assessment = md.indexOf('## SYSTEM ASSESSMENT')
    const findings = md.indexOf('## TOP FINDINGS')
    const investigations = md.indexOf('## ACTIVE INVESTIGATIONS')
    const freshness = md.indexOf('## DISCOVERY FRESHNESS')
    const enrichment = md.indexOf('## ADDRESS ENRICHMENT')
    const repair = md.indexOf('## CATALOG REPAIR')
    const metros = md.indexOf('## STRATEGIC METRO GAPS')
    const seo = md.indexOf('## SEO READINESS')
    const ledger = md.indexOf('## PROJECT LEDGER')

    expect(assessment).toBeGreaterThanOrEqual(0)
    expect(findings).toBeGreaterThan(assessment)
    expect(investigations).toBeGreaterThan(findings)
    expect(freshness).toBeGreaterThan(investigations)
    expect(enrichment).toBeGreaterThan(freshness)
    expect(repair).toBeGreaterThan(enrichment)
    expect(metros).toBeGreaterThan(repair)
    expect(seo).toBeGreaterThan(metros)
    expect(ledger).toBeGreaterThan(seo)
    expect(md).toContain('95.5% of enrichment cohort never attempted')
    expect(md).toContain('freshness_risk')
    expect(md).toContain('phoenix-az')
  })
})

describe('buildIngestionDiagnostics copy v1 integration', () => {
  it('prepends synthesized sections before live backlog', () => {
    const md = buildIngestionDiagnostics(minimalMetrics(), { ystmCoverage: minimalCoverage() })
    expect(md.indexOf('## SYSTEM ASSESSMENT')).toBeLessThan(md.indexOf('## Live backlog'))
    expect(md.indexOf('## PROJECT LEDGER')).toBeLessThan(md.indexOf('## Live backlog'))
    expect(md).toContain('## TOP FINDINGS')
  })

  it('renders enrichment and needs_check deep sections without ystmCoverage.ok', () => {
    const md = buildIngestionDiagnostics(minimalMetrics(), { ystmCoverage: null })
    expect(md).toContain('## ADDRESS_ENRICHMENT_DRAIN_REPAIR')
    expect(md).toContain('## NEEDS_CHECK_ROOT_CAUSE_DISCOVERY')
    expect(md).not.toContain('## External marketplace nationwide coverage')
    expect(md).toContain('## ADDRESS ENRICHMENT')
  })
})
