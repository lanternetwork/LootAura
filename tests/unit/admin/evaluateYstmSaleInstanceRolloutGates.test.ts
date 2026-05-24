import { describe, expect, it } from 'vitest'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import {
  ACTIVE_IDENTITY_KEY_COVERAGE_MIN,
  DUPLICATE_VISIBLE_CLUSTER_RATE_MAX,
  evaluateYstmSaleInstanceRolloutGates,
} from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function minimalCoverage(
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
    ...overrides,
  }
}

describe('evaluateYstmSaleInstanceRolloutGates', () => {
  it('passes observability and enforcement when scoreboard is green', () => {
    const snap = evaluateYstmSaleInstanceRolloutGates(minimalCoverage())
    expect(snap.observabilityReady).toBe(true)
    expect(snap.enforcementReady).toBe(true)
    expect(snap.gates.find((g) => g.id === 'shadow_no_divergence')?.status).toBe('pass')
  })

  it('fails enforcement when shadow divergence remains', () => {
    const snap = evaluateYstmSaleInstanceRolloutGates(
      minimalCoverage({
        saleInstanceShadowReplay: {
          ...minimalCoverage().saleInstanceShadowReplay,
          divergenceOldSuppressNewPublishCount: 3,
        },
      })
    )
    expect(snap.enforcementReady).toBe(false)
    expect(snap.gates.find((g) => g.id === 'shadow_no_divergence')?.status).toBe('fail')
  })

  it('fails duplicate-visible SLO when cluster rate exceeds threshold', () => {
    const published = 1000
    const clusters = Math.ceil(published * DUPLICATE_VISIBLE_CLUSTER_RATE_MAX) + 1
    const snap = evaluateYstmSaleInstanceRolloutGates(
      minimalCoverage({
        publishedActiveLootAuraYstmUrls: published,
        falseExclusionSaleIdentity: {
          ...minimalCoverage().falseExclusionSaleIdentity,
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
      minimalCoverage({
        publishedActiveLootAuraYstmUrls: published,
        saleInstanceIdentity: {
          ...minimalCoverage().saleInstanceIdentity,
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
