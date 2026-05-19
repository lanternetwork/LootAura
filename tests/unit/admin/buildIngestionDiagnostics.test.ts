import { describe, expect, it } from 'vitest'
import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

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
    const data = {
      ok: true,
      generatedAt: '2026-05-18T12:00:00.000Z',
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
        fetch: {} as IngestionMetricsResponse['volume']['fetch'],
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
          detailFirst: {
            attempted: 4,
            succeeded: 2,
            published: 1,
            fallback: 2,
            fetchFailed: 1,
            freshInsertReadyAtInsertRate: 0.13,
            medianMsToPublished: 420,
            providerGeocodeBypassRate: 0.5,
          },
          configLeaderboards: {
            topFreshYield: [],
            topStale: [],
            topDuplicate: [],
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
    expect(md).toContain('- duplicate/skipped: 10')
    expect(md).toContain('- skipped expired: 5')
    expect(md).toContain('- fresh inserted: 15')
    expect(md).toContain('- attempted: 4')
    expect(md).toContain('- published/hour: 3')
    expect(md).toContain('- insert yield: 0.0%')
    expect(md).toContain('- saturation: 0.0%')
    expect(md).toContain('- geocode failed: 0')
    expect(md).toContain('- percentage: —')
  })
})
