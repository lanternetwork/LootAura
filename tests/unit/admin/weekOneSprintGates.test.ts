import { describe, expect, it } from 'vitest'
import { evaluateWeekOneSprintGates } from '@/lib/admin/weekOneSprintGates'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

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
    sourceExpansion: {
      crawlableConfigs: 62,
      configsWithoutSourcePages: 922,
      pendingDiscoveryConfigs: 0,
      validatedDiscoveryConfigs: 54,
    },
    missingIngestion: {
      missingIngestionQueue: 7,
      missingIngestionNeverAttempted: 3,
    },
    existingRefresh: { staleOver12h: 144, refreshQueueTotal: 144 },
    catalogRepair: { repairQueueTotal: 269 },
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
        discoveryLatencyMs: 1200,
        configsPromoted: 28,
        candidatePagesDiscovered: 0,
        candidatePagesValid: 0,
        graphEnumerationSkippedReason: 'empty_state_batch',
        graphEnumerationThrottled: false,
        phasesCompleted: [],
      },
      sourceExpansion: {
        crawlableConfigs: 62,
        configsWithoutSourcePages: 922,
      },
    },
    operationalHealth: { healthy: false, alerts: [] },
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
          crawlableConfigs: 250,
          configsWithoutSourcePages: 400,
          pendingDiscoveryConfigs: 10,
          validatedDiscoveryConfigs: 100,
        },
        catalogRepair: { repairQueueTotal: 50 },
        pipelineBacklog: {
          missingValidUrls: 20,
          missingIngestionQueue: 20,
          missingIngestionNeverAttempted: 5,
          catalogRepairQueue: 50,
          existingRefreshStale: 30,
        },
        graphEnumeration: {
          ...minimalScoreboard().graphEnumeration,
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
            discoveryLatencyMs: 45000,
            configsPromoted: 12,
            candidatePagesDiscovered: 200,
            candidatePagesValid: 150,
            graphEnumerationSkippedReason: null,
            graphEnumerationThrottled: false,
            phasesCompleted: ['graph_enumeration', 'promote'],
          },
        },
      })
    )
    expect(snapshot.allPass).toBe(true)
  })
})
