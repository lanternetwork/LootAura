import { describe, expect, it } from 'vitest'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import {
  ACTIVE_IDENTITY_KEY_COVERAGE_MIN,
  DUPLICATE_VISIBLE_CLUSTER_RATE_MAX,
  evaluateYstmSaleInstanceRolloutGates,
} from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { emptyMissingValidReconciliationClassCounts } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliationTypes'
import { minimalYstmDiscoveryFreshnessMetrics } from '@/tests/unit/admin/minimalYstmDiscoveryFreshnessMetrics'
import { minimalYstm2HourIngestionDiagnostics } from '@/tests/unit/admin/minimalYstm2HourIngestionDiagnostics'
import { minimalMissingIngestCronHealth } from '@/tests/unit/admin/minimalMissingIngestCronHealth'

function minimalActionableMissingValid(rawMissing = 10) {
  const byClass = emptyMissingValidReconciliationClassCounts()
  byClass.RECOVERABLE = Math.min(rawMissing, 3)
  return {
    rawMissingValidYstmUrls: rawMissing,
    effectiveMissingValidYstmUrls: byClass.RECOVERABLE,
    actionableMissingValidYstmUrls: byClass.RECOVERABLE,
    byReconciliationClass: byClass,
    terminalDispositionCount: 0,
    visibilityFilterZombieCount: 0,
    expiredInventoryCount: 0,
    staleObservationCount: 0,
    recoverableCount: byClass.RECOVERABLE,
    missingIngestFetchFailedRetryableCount: 0,
    duplicateSuppressedCount: 0,
    unknownActionableCount: 0,
    unknownNonActionableCount: 0,
  }
}

export function minimalYstmCoverageScoreboard(
  overrides: Partial<YstmCoverageMetricsResponse> = {}
): YstmCoverageMetricsResponse {
  return {
    ok: true,
    targetPct: 90,
    generatedAt: '2026-05-22T00:00:00Z',
    lastAuditAt: '2026-05-22T08:00:00Z',
    lastAuditStatus: 'completed',
    validActiveYstmUrls: 100,
    publishedActiveLootAuraYstmUrls: 200,
    publishedVisibleInAuditFootprint: 90,
    missingValidYstmUrls: 10,
    coveragePct: 90,
    observationFootprintUrls: 100,
    missingByState: {},
    missingByMetro: {},
    trend: [],
    lastRun: null,
    sourceExpansion: {
      generatedAt: '2026-05-22T00:00:00Z',
      enabledExternalConfigs: 0,
      crawlableConfigs: 200,
      configsSkippedNoSourcePages: 0,
      configsSkippedInvalidUrls: 0,
      configsSkippedCrawlExcluded: 0,
      pendingDiscoveryConfigs: 0,
      validatedDiscoveryConfigs: 0,
      failedDiscoveryConfigs: 0,
      saturatedConfigs: 0,
      configsWithRecentInsert: 0,
      configsWithoutSourcePages: 0,
    },
    missingIngestion: {
      missingQueueTotal: 10,
      missingIngestionAttempted: 5,
      missingIngestionPublished: 2,
      missingIngestionIngested: 3,
      missingIngestionFailed: 0,
      missingIngestionSkippedVisible: 0,
      missingIngestionSkippedExisting: 0,
      missingIngestionNeverAttempted: 3,
    },
    missingIngestFetchFailed: {
      retryableCount: 0,
      terminalized: 0,
      retriedLast24h: 0,
      successfulReplaysLast24h: 0,
      failedReplaysLast24h: 0,
      ageDistribution: {},
      oldestLastAttemptAt: null,
    },
    actionableMissingValid: minimalActionableMissingValid(10),
    existingRefresh: {
      externalIngestedTotal: 0,
      ystmDetailIngestedTotal: 0,
      syncedLast24h: 0,
      neverSynced: 0,
      staleOver12h: 0,
    },
    catalogRepair: {
      repairQueueTotal: 0,
      needsGeocode: 0,
      readyUnpublished: 0,
      publishFailed: 0,
      needsCheck: 0,
      repairedPublishedLast24h: 0,
      repairFailed: 0,
    },
    pipelineBacklog: {
      missingValidUrls: 10,
      missingIngestionQueue: 10,
      missingIngestionNeverAttempted: 3,
      catalogRepairQueue: 0,
      existingRefreshStale: 0,
    },
    sloAttainment: {
      requiredConsecutiveDays: 14,
      consecutiveDaysAtTarget: 0,
      programMinFootprint: 5000,
      footprintMeetsProgramMinimum: false,
      latestDayQualifies: false,
      programComplete: false,
    },
    graphEnumeration: {
      generatedAt: '2026-05-22T00:00:00Z',
      catalogStates: 50,
      statesWithCandidates: 10,
      statesRemaining: 40,
      candidatesDiscovered: 100,
      validatedPages: 80,
      pendingValidation: 20,
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
        crawlableConfigs: 200,
        configsSkippedNoSourcePages: 0,
        configsSkippedInvalidUrls: 0,
        configsSkippedCrawlExcluded: 0,
        pendingDiscoveryConfigs: 0,
        validatedDiscoveryConfigs: 0,
        failedDiscoveryConfigs: 0,
        saturatedConfigs: 0,
        configsWithRecentInsert: 0,
        configsWithoutSourcePages: 0,
      },
    },
    operationalHealth: { healthy: true, alerts: [] },
    falseExclusionAudit: {
      generatedAt: '2026-05-22T00:00:00Z',
      missingValidCount: 10,
      tracedCount: 10,
      byPrimaryBucket: {} as never,
      traces: [],
    },
    saleInstanceIdentity: {
      ystmRowsWithKey: 200,
      ystmActiveRowsWithKey: 195,
      keyCollisionGroups: 0,
      sampleCollisionKeys: [],
    },
    canonicalSaleInstance: {
      externalRowsWithCanonicalKey: 180,
      externalActiveRowsWithCanonicalKey: 175,
      externalPublishedActiveWithCanonicalKey: 150,
      externalActiveEligible: 195,
      canonicalCoveragePct: 96,
      canonicalCollisionGroups: 2,
      crossProviderCanonicalGroups: 1,
      sampleCrossProviderCanonicalKeys: [],
    },
    crossProviderShadow: {
      shadowRecords24h: 12,
      falseNegativeCount24h: 0,
      falseNegativeCount7d: 0,
      wouldLinkCount24h: 4,
      wouldSuppressPublishCount24h: 2,
      wouldPublishDistinctCount24h: 6,
      lastRecordedAt: '2026-05-22T00:00:00Z',
    },
    crossProviderConvergence: {
      duplicatePublishedCanonicalClusters: 0,
      observationPublished24h: 4,
      crossProviderShadowMatches24h: 4,
      publishLinkRate24h: 1,
      ambiguousDispositionCount7d: 0,
      ambiguousDispositionShare7d: 0,
      sloAttainment: {
        requiredConsecutiveDays: 14,
        consecutiveZeroDuplicateDays: 14,
        latestDayQualifies: true,
        programComplete: true,
      },
      sloTrend: [],
    },
    sourceUrlAlias: { totalAliasRows: 50 },
    saleInstanceShadowReplay: {
      generatedAt: '2026-05-22T00:00:00Z',
      replayedCount: 10,
      oldSuppressCount: 4,
      newSuppressCount: 1,
      wouldPublishCount: 0,
      divergenceOldSuppressNewPublishCount: 0,
      ambiguousCount: 0,
      sampleDivergences: [],
    },
    falseExclusionSaleIdentity: {
      generatedAt: '2026-05-22T00:00:00Z',
      missingValidYstmUrls: 10,
      missingNeverAttempted: 3,
      urlMatchSameDates: 0,
      urlMatchDatesChanged: 0,
      urlReuseDetected: 0,
      newEventSameUrl: 0,
      sameEventUpdated: 0,
      softDedupeSuppressed: 0,
      suspiciousSuppressions: 0,
      ambiguousRequiresReview: 0,
      saleInstanceKeyCollisions: 0,
      duplicateVisibleSaleClusters24h: 0,
      duplicateVisibleSameAddressDate24h: 0,
      coverageMatchMethodCounts: { sale_instance_key: 90 },
      coverageWithoutMatchMethod: 0,
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
    discoveryFreshness: minimalYstmDiscoveryFreshnessMetrics(),
    twoHourIngestion: minimalYstm2HourIngestionDiagnostics(),
    missingIngestCronHealth: minimalMissingIngestCronHealth(),
    ...overrides,
  }
}

describe('evaluateYstmSaleInstanceRolloutGates', () => {
  it('passes observability and enforcement when scoreboard is green', () => {
    const snap = evaluateYstmSaleInstanceRolloutGates(minimalYstmCoverageScoreboard())
    expect(snap.observabilityReady).toBe(true)
    expect(snap.enforcementReady).toBe(true)
    expect(snap.crossProviderEnforcementReady).toBe(true)
    expect(snap.gates.find((g) => g.id === 'shadow_no_divergence')?.status).toBe('pass')
  })

  it('fails enforcement when shadow divergence remains', () => {
    const snap = evaluateYstmSaleInstanceRolloutGates(
      minimalYstmCoverageScoreboard({
        saleInstanceShadowReplay: {
          ...minimalYstmCoverageScoreboard().saleInstanceShadowReplay,
          divergenceOldSuppressNewPublishCount: 3,
        },
      })
    )
    expect(snap.enforcementReady).toBe(false)
    expect(snap.gates.find((g) => g.id === 'shadow_no_divergence')?.status).toBe('fail')
  })

  it('fails cross-provider enforcement when duplicate canonical publishes exist', () => {
    const snap = evaluateYstmSaleInstanceRolloutGates(
      minimalYstmCoverageScoreboard({
        crossProviderConvergence: {
          ...minimalYstmCoverageScoreboard().crossProviderConvergence,
          duplicatePublishedCanonicalClusters: 2,
          sloAttainment: {
            requiredConsecutiveDays: 14,
            consecutiveZeroDuplicateDays: 0,
            latestDayQualifies: false,
            programComplete: false,
          },
        },
      })
    )
    expect(snap.crossProviderEnforcementReady).toBe(false)
    expect(snap.gates.find((g) => g.id === 'cross_provider_duplicate_canonical_publish')?.status).toBe(
      'fail'
    )
  })

  it('fails duplicate-visible SLO when cluster rate exceeds threshold', () => {
    const published = 1000
    const clusters = Math.ceil(published * DUPLICATE_VISIBLE_CLUSTER_RATE_MAX) + 1
    const snap = evaluateYstmSaleInstanceRolloutGates(
      minimalYstmCoverageScoreboard({
        publishedActiveLootAuraYstmUrls: published,
        falseExclusionSaleIdentity: {
          ...minimalYstmCoverageScoreboard().falseExclusionSaleIdentity,
          duplicateVisibleSaleClusters24h: clusters,
        },
      })
    )
    expect(snap.gates.find((g) => g.id === 'duplicate_visible_slo')?.status).toBe('fail')
  })

  it('pending identity backfill when active key share is below minimum', () => {
    const published = 200
    const withKey = Math.floor(published * ACTIVE_IDENTITY_KEY_COVERAGE_MIN) - 1
    const snap = evaluateYstmSaleInstanceRolloutGates(
      minimalYstmCoverageScoreboard({
        publishedActiveLootAuraYstmUrls: published,
        saleInstanceIdentity: {
          ...minimalYstmCoverageScoreboard().saleInstanceIdentity,
          ystmActiveRowsWithKey: withKey,
        },
      })
    )
    expect(snap.gates.find((g) => g.id === 'identity_active_key_coverage')?.status).toBe(
      'pending'
    )
    expect(snap.enforcementReady).toBe(false)
  })
})
