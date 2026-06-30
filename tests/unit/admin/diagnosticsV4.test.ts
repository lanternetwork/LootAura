import { describe, expect, it } from 'vitest'
import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
import { buildComputedAlerts, buildOperatorActions } from '@/lib/admin/diagnostics/v4/alerts'
import {
  buildDuplicateHealthSnapshot,
  buildVisibilitySnapshot,
  exceedsVisibleDuplicateThreshold,
} from '@/lib/admin/diagnostics/v4/buildDomainSnapshots'
import { buildIngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/buildIngestionDiagnosticsModel'
import { resolvePrimaryBottleneck } from '@/lib/admin/diagnostics/v4/bottleneckResolver'
import { DIAGNOSTICS_MODEL_VERSION } from '@/lib/admin/diagnostics/v4/constants'
import { buildDiagnosticsExport } from '@/lib/admin/diagnostics/v4/export/buildDiagnosticsExport'
import { buildEngineeringReport } from '@/lib/admin/diagnostics/v4/export/buildEngineeringReport'
import { INGESTION_DIAGNOSTICS_REGISTRY } from '@/lib/admin/diagnostics/v4/registry'
import { CRITICAL_INGESTION_CRONS, buildSchedulerCronHealth } from '@/lib/admin/diagnostics/v4/schedulerHealth'
import {
  evaluateIngestionSlos,
  getBlockingSloFailures,
} from '@/lib/admin/diagnostics/v4/sloEvaluation'
import { deriveSystemHealthLevel } from '@/lib/admin/diagnostics/v4/systemHealth'
import { minimalMissingIngestCronHealth } from '@/tests/unit/admin/minimalMissingIngestCronHealth'
import {
  diagnosticsV4Coverage,
  diagnosticsV4Metrics,
  publishedNotVisibleAudit,
} from '@/tests/unit/admin/diagnosticsV4Fixtures'

describe('ingestion diagnostics v4', () => {
  describe('registry', () => {
    it('defines unique operational ids with export modes', () => {
      const ids = INGESTION_DIAGNOSTICS_REGISTRY.map((entry) => entry.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(INGESTION_DIAGNOSTICS_REGISTRY.some((e) => e.exportModes.includes('operations'))).toBe(
        true
      )
      expect(INGESTION_DIAGNOSTICS_REGISTRY.find((e) => e.id === 'rollout_gates')?.exportModes).toEqual([
        'full',
      ])
    })

    it('lists all critical ingestion crons', () => {
      expect(CRITICAL_INGESTION_CRONS.map((c) => c.id)).toEqual([
        'daily_orchestration',
        'publish_worker',
        'geocode_cron',
        'catalog_repair',
        'missing_ingest',
        'coverage_audit',
        'duplicate_canonical_slo',
        'existing_refresh',
      ])
    })
  })

  describe('SLO evaluation', () => {
    it('passes healthy baseline SLOs', () => {
      const slos = evaluateIngestionSlos(diagnosticsV4Metrics(), diagnosticsV4Coverage())
      expect(getBlockingSloFailures(slos)).toHaveLength(0)
      expect(slos.find((s) => s.id === 'duplicate_convergence_streak')?.pass).toBe(true)
    })

    it('flags blocking duplicate canonical clusters', () => {
      const coverage = diagnosticsV4Coverage({
        crossProviderConvergence: {
          ...diagnosticsV4Coverage().crossProviderConvergence,
          duplicatePublishedCanonicalClusters: 2,
        },
      })
      const blocking = getBlockingSloFailures(evaluateIngestionSlos(diagnosticsV4Metrics(), coverage))
      expect(blocking.map((s) => s.id)).toContain('duplicate_canonical_clusters')
    })

    it('uses consecutiveZeroDuplicateDays for convergence streak', () => {
      const coverage = diagnosticsV4Coverage({
        crossProviderConvergence: {
          ...diagnosticsV4Coverage().crossProviderConvergence,
          sloAttainment: {
            requiredConsecutiveDays: 14,
            consecutiveZeroDuplicateDays: 5,
            latestDayQualifies: true,
            programComplete: false,
          },
        },
      })
      const row = evaluateIngestionSlos(diagnosticsV4Metrics(), coverage).find(
        (s) => s.id === 'duplicate_convergence_streak'
      )
      expect(row?.pass).toBe(false)
      expect(row?.actual).toBe('5 / 14')
    })
  })

  describe('visibility split', () => {
    it('separates observation stale from true visibility failures', () => {
      const metrics = diagnosticsV4Metrics({
        publishedNotVisibleDistributionAnalysis: publishedNotVisibleAudit(),
      })
      const coverage = diagnosticsV4Coverage({
        falseExclusionAudit: {
          ...diagnosticsV4Coverage().falseExclusionAudit,
          byPrimaryBucket: {
            ...diagnosticsV4Coverage().falseExclusionAudit.byPrimaryBucket,
            published_not_visible: 100,
          },
        },
      })
      const visibility = buildVisibilitySnapshot(metrics, coverage)
      expect(visibility.observationStale).toBe(80)
      expect(visibility.trueVisibilityFailure).toBe(10)
      expect(visibility.publishedNotVisibleTotal).toBe(100)
    })
  })

  describe('duplicate health', () => {
    it('computes visible duplicate rate from coverage', () => {
      const coverage = diagnosticsV4Coverage({
        publishedActiveLootAuraYstmUrls: 1000,
        falseExclusionSaleIdentity: {
          ...diagnosticsV4Coverage().falseExclusionSaleIdentity,
          duplicateVisibleSaleClusters24h: 8,
        },
      })
      const dup = buildDuplicateHealthSnapshot(coverage)
      expect(dup.visibleDuplicateRate).toBeCloseTo(0.008)
      expect(exceedsVisibleDuplicateThreshold(dup.visibleDuplicateRate)).toBe(true)
    })
  })

  describe('bottleneck resolver', () => {
    it('prefers blocking SLO failure over queues', () => {
      const metrics = diagnosticsV4Metrics({
        failureBreakdown: {
          needs_check: 200,
          publish_failed: 60,
          expired: 0,
          ready: 0,
          publishing: 0,
        },
      })
      const coverage = diagnosticsV4Coverage({
        catalogRepair: { ...diagnosticsV4Coverage().catalogRepair, repairQueueTotal: 500 },
      })
      const slos = evaluateIngestionSlos(metrics, coverage)
      const bottleneck = resolvePrimaryBottleneck(metrics, coverage, getBlockingSloFailures(slos))
      expect(bottleneck.id).toBe('publish_failed_terminal')
    })

    it('selects aged queue with insufficient drain when no blocking SLO', () => {
      const metrics = diagnosticsV4Metrics({
        published24h: 100,
        funnel: {
          ...diagnosticsV4Metrics().funnel,
          '24h': {
            ...diagnosticsV4Metrics().funnel['24h'],
            stages: diagnosticsV4Metrics()
              .funnel['24h'].stages.map((s) =>
                s.id === 'published' ? { ...s, count: 20 } : s
              ),
          },
        },
      })
      const coverage = diagnosticsV4Coverage({
        catalogRepair: { ...diagnosticsV4Coverage().catalogRepair, repairQueueTotal: 120 },
      })
      const bottleneck = resolvePrimaryBottleneck(metrics, coverage, [])
      expect(bottleneck.id).toBe('catalog_repair')
    })
  })

  describe('system health', () => {
    it('returns critical when blocking SLOs fail', () => {
      const metrics = diagnosticsV4Metrics({
        failureBreakdown: {
          needs_check: 0,
          publish_failed: 99,
          expired: 0,
          ready: 0,
          publishing: 0,
        },
      })
      const model = buildIngestionDiagnosticsModel({
        metrics,
        coverage: diagnosticsV4Coverage(),
        environment: 'test',
      })
      expect(model.systemHealth).toBe('critical')
    })

    it('returns healthy for clean baseline', () => {
      const model = buildIngestionDiagnosticsModel({
        metrics: diagnosticsV4Metrics(),
        coverage: diagnosticsV4Coverage(),
        environment: 'test',
      })
      expect(model.systemHealth).toBe('healthy')
    })
  })

  describe('scheduler health', () => {
    it('maps missing-ingest cron from coverage health', () => {
      const coverage = diagnosticsV4Coverage({
        missingIngestCronHealth: minimalMissingIngestCronHealth({
          lastCompletedAt: '2026-06-17T11:00:00.000Z',
          minutesSinceCompletion: 30,
          crashLoopDetected: false,
        }),
      })
      const rows = buildSchedulerCronHealth(coverage)
      const missing = rows.find((r) => r.id === 'missing_ingest')
      expect(missing?.state).toBe('ok')
      expect(missing?.lastSuccessAt).toBe('2026-06-17T11:00:00.000Z')
    })
  })

  describe('alerts and operator actions', () => {
    it('emits critical alert for blocking SLO failures', () => {
      const metrics = diagnosticsV4Metrics({
        failureBreakdown: {
          needs_check: 0,
          publish_failed: 99,
          expired: 0,
          ready: 0,
          publishing: 0,
        },
      })
      const coverage = diagnosticsV4Coverage()
      const blocking = getBlockingSloFailures(evaluateIngestionSlos(metrics, coverage))
      const alerts = buildComputedAlerts(metrics, coverage, blocking)
      expect(alerts.some((a) => a.id === 'slo_publish_failed_terminal')).toBe(true)
      const actions = buildOperatorActions(metrics, coverage, alerts)
      expect(actions.length).toBeGreaterThan(0)
      expect(actions.length).toBeLessThanOrEqual(3)
    })
  })

  describe('exports', () => {
    it('builds operations report without legacy sections', () => {
      const model = buildIngestionDiagnosticsModel({
        metrics: diagnosticsV4Metrics(),
        coverage: diagnosticsV4Coverage(),
        environment: 'preview',
        generatedAt: '2026-06-17T12:00:00.000Z',
      })
      const ops = buildDiagnosticsExport(model, 'operations')
      expect(ops).toContain('Ingestion Operations Report')
      expect(ops).toContain('## SLO Status')
      expect(ops).not.toContain('Legacy Engineering Detail')
    })

    it('engineering report is superset of legacy clipboard', () => {
      const metrics = diagnosticsV4Metrics()
      const coverage = diagnosticsV4Coverage()
      const model = buildIngestionDiagnosticsModel({
        metrics,
        coverage,
        environment: 'preview',
        generatedAt: '2026-06-17T12:00:00.000Z',
      })
      const engineering = buildEngineeringReport(model)
      const legacy = buildIngestionDiagnostics(metrics, {
        environment: 'preview',
        copiedAt: '2026-06-17T12:00:00.000Z',
        ystmCoverage: coverage,
      })
      expect(engineering).toContain('Legacy Engineering Detail')
      expect(engineering).toContain(legacy.trim())
    })

    it('full export includes rollout gates when coverage present', () => {
      const model = buildIngestionDiagnosticsModel({
        metrics: diagnosticsV4Metrics(),
        coverage: diagnosticsV4Coverage(),
        environment: 'preview',
      })
      const full = buildDiagnosticsExport(model, 'full')
      expect(full).toContain('Rollout Gates')
    })
  })

  describe('model assembly', () => {
    it('returns versioned diagnostics model', () => {
      const model = buildIngestionDiagnosticsModel({
        metrics: diagnosticsV4Metrics(),
        coverage: diagnosticsV4Coverage(),
        environment: 'production',
      })
      expect(model.diagnosticsModelVersion).toBe(DIAGNOSTICS_MODEL_VERSION)
      expect(model.registry.length).toBeGreaterThan(0)
      expect(model.pipeline.length).toBe(6)
      expect(model.operatorActions.length).toBeLessThanOrEqual(3)
    })
  })
})
