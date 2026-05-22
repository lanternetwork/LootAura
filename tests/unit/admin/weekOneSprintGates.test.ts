import { describe, expect, it } from 'vitest'
import type { YstmGraphEnumerationMetrics } from '@/lib/admin/ystmGraphEnumerationMetrics'
import type { YstmSourceExpansionMetrics } from '@/lib/admin/ystmSourceExpansionMetrics'
import { evaluateWeekOneSprintGates } from '@/lib/admin/weekOneSprintGates'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import type { YstmCatalogRepairAggregate } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairStore'
import type { YstmCoverageMissingIngestionAggregate } from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import type { YstmExistingUrlRefreshAggregate } from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshMetrics'
import {
  FALSE_EXCLUSION_TRACE_BUCKETS,
  type FalseExclusionTraceBucket,
} from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'

function emptyFalseExclusionBuckets(): Record<FalseExclusionTraceBucket, number> {
  return Object.fromEntries(
    FALSE_EXCLUSION_TRACE_BUCKETS.map((b) => [b, 0])
  ) as Record<FalseExclusionTraceBucket, number>
}

const sourceExpansionFixture: YstmSourceExpansionMetrics = {
  generatedAt: '2026-05-22T00:00:00Z',
  enabledExternalConfigs: 1000,
  crawlableConfigs: 62,
  configsSkippedNoSourcePages: 0,
  configsSkippedInvalidUrls: 0,
  configsSkippedCrawlExcluded: 0,
  pendingDiscoveryConfigs: 0,
  validatedDiscoveryConfigs: 54,
  failedDiscoveryConfigs: 0,
  saturatedConfigs: 0,
  configsWithRecentInsert: 0,
  configsWithoutSourcePages: 922,
}

const missingIngestionFixture: YstmCoverageMissingIngestionAggregate = {
  missingQueueTotal: 7,
  missingIngestionAttempted: 4,
  missingIngestionPublished: 1,
  missingIngestionIngested: 2,
  missingIngestionFailed: 0,
  missingIngestionSkippedVisible: 0,
  missingIngestionSkippedExisting: 0,
  missingIngestionNeverAttempted: 3,
}

const existingRefreshFixture: YstmExistingUrlRefreshAggregate = {
  externalIngestedTotal: 756,
  ystmDetailIngestedTotal: 700,
  syncedLast24h: 50,
  neverSynced: 10,
  staleOver12h: 144,
}

const catalogRepairFixture: YstmCatalogRepairAggregate = {
  repairQueueTotal: 269,
  needsGeocode: 80,
  readyUnpublished: 40,
  publishFailed: 42,
  needsCheck: 50,
  repairedPublishedLast24h: 5,
  repairFailed: 2,
}

const graphEnumerationFixture: YstmGraphEnumerationMetrics = {
  generatedAt: '2026-05-22T00:00:00Z',
  catalogStates: 51,
  statesWithCandidates: 0,
  statesRemaining: 51,
  candidatesDiscovered: 0,
  validatedPages: 0,
  pendingValidation: 0,
  invalidPagesByStatus: {},
  promotedCandidates: 0,
  configsPromotedLastRun: 28,
  validationsLast24h: 0,
  fetchFailureRate24h: 0,
  blockRate24h: 0,
  throttleRecommended: false,
  lastDiscoveryRun: {
    completedAt: '2026-05-21T08:00:00Z',
    ok: true,
    skipped: false,
    skipReason: null,
    degraded: false,
    statesScanned: 0,
    catalogSize: 51,
    stateBatchPlanned: 10,
    discoveryLatencyMs: 1200,
    configsPromoted: 28,
    candidatePagesDiscovered: 0,
    candidatePagesValid: 0,
    graphEnumerationSkippedReason: 'empty_state_batch',
    graphEnumerationThrottled: false,
    phasesCompleted: [],
  },
  sourceExpansion: sourceExpansionFixture,
}

function minimalScoreboard(overrides: Partial<YstmCoverageMetricsResponse> = {}): YstmCoverageMetricsResponse {
  return {
    ok: true,
    targetPct: 90,
    generatedAt: '2026-05-22T00:00:00Z',
    lastAuditAt: null,
    lastAuditStatus: null,
    validActiveYstmUrls: 78,
    publishedActiveLootAuraYstmUrls: 324,
    publishedVisibleInAuditFootprint: 71,
    missingValidYstmUrls: 7,
    coveragePct: 91,
    observationFootprintUrls: 703,
    missingByState: {},
    missingByMetro: {},
    trend: [],
    lastRun: null,
    sourceExpansion: sourceExpansionFixture,
    missingIngestion: missingIngestionFixture,
    existingRefresh: existingRefreshFixture,
    catalogRepair: catalogRepairFixture,
    pipelineBacklog: {
      missingValidUrls: 7,
      missingIngestionQueue: 7,
      missingIngestionNeverAttempted: 3,
      catalogRepairQueue: 269,
      existingRefreshStale: 144,
    },
    sloAttainment: {
      requiredConsecutiveDays: 14,
      consecutiveDaysAtTarget: 1,
      programMinFootprint: 5000,
      footprintMeetsProgramMinimum: false,
      latestDayQualifies: false,
      programComplete: false,
    },
    graphEnumeration: graphEnumerationFixture,
    operationalHealth: { healthy: false, alerts: [] },
    falseExclusionAudit: {
      generatedAt: '2026-05-22T00:00:00Z',
      missingValidCount: 7,
      tracedCount: 7,
      byPrimaryBucket: emptyFalseExclusionBuckets(),
      traces: [],
    },
    saleInstanceIdentity: {
      ystmRowsWithKey: 0,
      ystmActiveRowsWithKey: 0,
      keyCollisionGroups: 0,
      sampleCollisionKeys: [],
    },
    sourceUrlAlias: { totalAliasRows: 0 },
    ...overrides,
  }
}

describe('evaluateWeekOneSprintGates', () => {
  it('fails discovery and footprint gates on production-like baseline', () => {
    const snapshot = evaluateWeekOneSprintGates(minimalScoreboard())
    expect(snapshot.allPass).toBe(false)
    expect(snapshot.gates.find((g) => g.id === 'discovery_registry')?.status).toBe('fail')
    expect(snapshot.gates.find((g) => g.id === 'footprint_crawlable')?.status).toBe('fail')
    expect(snapshot.gates.find((g) => g.id === 'repair_queue')?.status).toBe('fail')
  })

  it('passes when week-1 targets are met', () => {
    const snapshot = evaluateWeekOneSprintGates(
      minimalScoreboard({
        validActiveYstmUrls: 350,
        sourceExpansion: {
          ...sourceExpansionFixture,
          crawlableConfigs: 250,
          configsWithoutSourcePages: 400,
          pendingDiscoveryConfigs: 10,
          validatedDiscoveryConfigs: 100,
        },
        catalogRepair: {
          ...catalogRepairFixture,
          repairQueueTotal: 50,
        },
        pipelineBacklog: {
          missingValidUrls: 20,
          missingIngestionQueue: 20,
          missingIngestionNeverAttempted: 5,
          catalogRepairQueue: 50,
          existingRefreshStale: 30,
        },
        graphEnumeration: {
          ...graphEnumerationFixture,
          candidatesDiscovered: 5000,
          statesWithCandidates: 25,
          lastDiscoveryRun: {
            completedAt: '2026-05-22T08:00:00Z',
            ok: true,
            skipped: false,
            skipReason: null,
            degraded: false,
            statesScanned: 20,
            catalogSize: 51,
            stateBatchPlanned: 10,
            discoveryLatencyMs: 45000,
            configsPromoted: 12,
            candidatePagesDiscovered: 200,
            candidatePagesValid: 150,
            graphEnumerationSkippedReason: null,
            graphEnumerationThrottled: false,
            phasesCompleted: ['placeholder_repair', 'graph_enumeration', 'promote'],
          },
        },
      })
    )
    expect(snapshot.allPass).toBe(true)
  })
})
