import type { SchedulerCronRow } from '@/lib/admin/diagnostics/v4/types'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export type CriticalCronDefinition = {
  readonly id: string
  readonly displayName: string
  readonly owner: string
  readonly expectedCadenceMinutes: number
  readonly tier: 'user_path' | 'maturity'
}

export const CRITICAL_INGESTION_CRONS: readonly CriticalCronDefinition[] = [
  {
    id: 'daily_orchestration',
    displayName: 'Daily ingestion orchestration',
    owner: 'ingestion orchestration',
    expectedCadenceMinutes: 24 * 60,
    tier: 'user_path',
  },
  {
    id: 'publish_worker',
    displayName: 'Publish worker',
    owner: 'publish worker',
    expectedCadenceMinutes: 15,
    tier: 'user_path',
  },
  {
    id: 'geocode_cron',
    displayName: 'Geocode cron',
    owner: 'geocode cron',
    expectedCadenceMinutes: 15,
    tier: 'user_path',
  },
  {
    id: 'catalog_repair',
    displayName: 'Catalog repair',
    owner: 'catalog-repair cron',
    expectedCadenceMinutes: 60,
    tier: 'maturity',
  },
  {
    id: 'missing_ingest',
    displayName: 'Missing URL ingestion',
    owner: 'missing-ingest cron',
    expectedCadenceMinutes: 60,
    tier: 'maturity',
  },
  {
    id: 'coverage_audit',
    displayName: 'Coverage audit',
    owner: 'coverage audit',
    expectedCadenceMinutes: 24 * 60,
    tier: 'maturity',
  },
  {
    id: 'duplicate_canonical_slo',
    displayName: 'Duplicate canonical SLO',
    owner: 'duplicate-canonical-slo cron',
    expectedCadenceMinutes: 24 * 60,
    tier: 'maturity',
  },
  {
    id: 'existing_refresh',
    displayName: 'Existing URL refresh',
    owner: 'existing-refresh cron',
    expectedCadenceMinutes: 60,
    tier: 'maturity',
  },
] as const

function classifyCadenceState(
  minutesSince: number | null,
  expectedCadenceMinutes: number,
  crashLoop: boolean,
  hasSuccess: boolean
): SchedulerCronRow['state'] {
  if (crashLoop) return 'crash_loop'
  if (!hasSuccess) return 'unknown'
  if (minutesSince == null) return 'unknown'
  if (minutesSince > expectedCadenceMinutes * 2) return 'late'
  if (minutesSince > expectedCadenceMinutes * 1.5) return 'late'
  return 'ok'
}

function unknownRow(cron: CriticalCronDefinition, reason: string): SchedulerCronRow {
  return {
    id: cron.id,
    displayName: cron.displayName,
    owner: cron.owner,
    expectedCadenceMinutes: cron.expectedCadenceMinutes,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    durationMs: null,
    minutesSinceSuccess: null,
    state: 'unknown',
    failureCount24h: null,
    crashLoopDetected: false,
    telemetryUnavailableReason: reason,
  }
}

export function buildSchedulerCronHealth(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): SchedulerCronRow[] {
  const missing = coverage?.missingIngestCronHealth
  const discoveryRun = coverage?.graphEnumeration?.lastDiscoveryRun

  return CRITICAL_INGESTION_CRONS.map((cron) => {
    if (cron.id === 'missing_ingest' && missing) {
      const state = classifyCadenceState(
        missing.minutesSinceCompletion,
        cron.expectedCadenceMinutes,
        missing.crashLoopDetected,
        Boolean(missing.lastCompletedAt)
      )
      return {
        id: cron.id,
        displayName: cron.displayName,
        owner: cron.owner,
        expectedCadenceMinutes: cron.expectedCadenceMinutes,
        lastStartedAt: missing.lastStartedAt,
        lastCompletedAt: missing.lastCompletedAt,
        lastSuccessAt: missing.lastCompletedAt,
        lastErrorAt: missing.crashLoopDetected ? missing.lastCompletedAt : null,
        lastErrorCode: missing.lastError,
        durationMs: null,
        minutesSinceSuccess: missing.minutesSinceCompletion,
        state: state === 'unknown' && missing.lastCompletedAt ? 'ok' : state,
        failureCount24h: null,
        crashLoopDetected: missing.crashLoopDetected,
        telemetryUnavailableReason: null,
      }
    }

    if (cron.id === 'coverage_audit' && coverage?.lastAuditAt) {
      const completedMs = Date.parse(coverage.lastAuditAt)
      const minutesSince = Number.isFinite(completedMs)
        ? Math.round(((Date.now() - completedMs) / 60_000) * 10) / 10
        : null
      const state = classifyCadenceState(
        minutesSince,
        cron.expectedCadenceMinutes,
        false,
        true
      )
      return {
        id: cron.id,
        displayName: cron.displayName,
        owner: cron.owner,
        expectedCadenceMinutes: cron.expectedCadenceMinutes,
        lastStartedAt: null,
        lastCompletedAt: coverage.lastAuditAt,
        lastSuccessAt: coverage.lastAuditAt,
        lastErrorAt: null,
        lastErrorCode: coverage.lastAuditStatus === 'failed' ? coverage.lastAuditStatus : null,
        durationMs: null,
        minutesSinceSuccess: minutesSince,
        state,
        failureCount24h: null,
        crashLoopDetected: false,
        telemetryUnavailableReason: null,
      }
    }

    if (cron.id === 'daily_orchestration' && discoveryRun) {
      const completedMs = Date.parse(discoveryRun.completedAt)
      const minutesSince = Number.isFinite(completedMs)
        ? Math.round(((Date.now() - completedMs) / 60_000) * 10) / 10
        : null
      const state = discoveryRun.ok
        ? classifyCadenceState(minutesSince, cron.expectedCadenceMinutes, false, true)
        : 'failed'
      return {
        id: cron.id,
        displayName: cron.displayName,
        owner: cron.owner,
        expectedCadenceMinutes: cron.expectedCadenceMinutes,
        lastStartedAt: null,
        lastCompletedAt: discoveryRun.completedAt,
        lastSuccessAt: discoveryRun.ok ? discoveryRun.completedAt : null,
        lastErrorAt: discoveryRun.ok ? null : discoveryRun.completedAt,
        lastErrorCode: discoveryRun.skipReason,
        durationMs: discoveryRun.discoveryLatencyMs,
        minutesSinceSuccess: minutesSince,
        state,
        failureCount24h: null,
        crashLoopDetected: false,
        telemetryUnavailableReason: null,
      }
    }

    if (cron.id === 'publish_worker') {
      const publish24h = metrics.volume.publish.publishSucceeded24h
      const attempted24h = metrics.volume.publish.publishAttempted24h
      const inferredOk = publish24h > 0 || attempted24h > 0
      if (inferredOk) {
        return {
          ...unknownRow(cron, 'no_cron_timestamp_telemetry'),
          state: 'ok',
          telemetryUnavailableReason:
            'Inferred healthy from 24h publish activity; cron timestamp telemetry not wired',
          lastSuccessAt: metrics.generatedAt,
          minutesSinceSuccess: 0,
        }
      }
      return unknownRow(cron, 'no_publish_activity_24h_and_no_cron_telemetry')
    }

    if (cron.id === 'geocode_cron') {
      const touches = metrics.geocodeTouches24h
      if (touches > 0) {
        return {
          ...unknownRow(cron, 'no_cron_timestamp_telemetry'),
          state: 'ok',
          telemetryUnavailableReason:
            'Inferred healthy from geocode touches 24h; cron timestamp telemetry not wired',
          lastSuccessAt: metrics.generatedAt,
          minutesSinceSuccess: 0,
        }
      }
      if (metrics.geocodeEligibleBacklog === 0) {
        return unknownRow(cron, 'no_geocode_backlog_and_no_cron_telemetry')
      }
      return {
        ...unknownRow(cron, 'no_cron_timestamp_telemetry'),
        state: 'late',
        telemetryUnavailableReason: 'Geocode backlog present without cron timestamp telemetry',
      }
    }

    if (cron.id === 'catalog_repair') {
      const repaired = coverage?.catalogRepair.repairedPublishedLast24h ?? 0
      if (repaired > 0) {
        return {
          ...unknownRow(cron, 'no_cron_timestamp_telemetry'),
          state: 'ok',
          telemetryUnavailableReason:
            'Inferred healthy from repairedPublishedLast24h; cron timestamp telemetry not wired',
          lastSuccessAt: metrics.generatedAt,
          minutesSinceSuccess: 0,
        }
      }
      return unknownRow(cron, 'no_catalog_repair_drain_signal_and_no_cron_telemetry')
    }

    if (cron.id === 'existing_refresh') {
      const synced = coverage?.existingRefresh.syncedLast24h ?? 0
      if (synced > 0) {
        return {
          ...unknownRow(cron, 'no_cron_timestamp_telemetry'),
          state: 'ok',
          telemetryUnavailableReason:
            'Inferred healthy from existingRefresh.syncedLast24h; cron timestamp telemetry not wired',
          lastSuccessAt: metrics.generatedAt,
          minutesSinceSuccess: 0,
        }
      }
      return unknownRow(cron, 'no_existing_refresh_sync_signal_and_no_cron_telemetry')
    }

    if (cron.id === 'duplicate_canonical_slo') {
      const streak =
        coverage?.crossProviderConvergence.sloAttainment?.consecutiveZeroDuplicateDays ?? 0
      if (streak > 0) {
        return {
          ...unknownRow(cron, 'no_cron_timestamp_telemetry'),
          state: 'ok',
          telemetryUnavailableReason:
            'Inferred from convergence SLO streak; cron timestamp telemetry not wired',
          lastSuccessAt: coverage?.crossProviderConvergence.sloAttainment?.latestDayQualifies
            ? metrics.generatedAt
            : null,
          minutesSinceSuccess: null,
        }
      }
      return unknownRow(cron, 'no_duplicate_slo_telemetry')
    }

    return unknownRow(cron, 'telemetry_source_not_configured')
  })
}
