import { describe, expect, it } from 'vitest'
import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
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

  it('appends YSTM coverage section when ystmCoverage is provided', async () => {
    const { evaluateWeekOneSprintGates } = await import('@/lib/admin/weekOneSprintGates')
    const data = {
      ok: true,
      generatedAt: '2026-05-22T00:00:00Z',
      funnel: { '24h': { stages: [], detailFirst: {}, ystm: {}, topDropoff: null } },
      volume: { bottleneck: 'none', hourlyRates: {}, geocode: {}, fetch: {}, acquisition: {}, addressLifecycle: {}, imageEnrichment: {} },
    } as unknown as IngestionMetricsResponse

    const ystmCoverage = {
      ok: true,
      generatedAt: '2026-05-22T00:00:00Z',
      validActiveYstmUrls: 78,
      missingValidYstmUrls: 7,
      publishedVisibleInAuditFootprint: 71,
      coveragePct: 91,
      lastAuditAt: null,
      sourceExpansion: { crawlableConfigs: 62, configsWithoutSourcePages: 922, pendingDiscoveryConfigs: 0, validatedDiscoveryConfigs: 0 },
      catalogRepair: { repairQueueTotal: 269 },
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
        sourceExpansion: { crawlableConfigs: 62, configsWithoutSourcePages: 922 },
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
    } as YstmCoverageMetricsResponse

    evaluateWeekOneSprintGates(ystmCoverage)

    const md = buildIngestionDiagnostics(data, { ystmCoverage })
    expect(md).toContain('## YSTM nationwide coverage')
    expect(md).toContain('### Week-1 sprint gates')
  })
})
