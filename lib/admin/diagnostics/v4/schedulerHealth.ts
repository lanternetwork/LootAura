import type { SchedulerCronRow } from '@/lib/admin/diagnostics/v4/types'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

export type CriticalCronDefinition = {
  readonly id: string
  readonly displayName: string
  readonly owner: string
  readonly expectedCadenceMinutes: number
}

export const CRITICAL_INGESTION_CRONS: readonly CriticalCronDefinition[] = [
  {
    id: 'daily_orchestration',
    displayName: 'Daily ingestion orchestration',
    owner: 'ingestion orchestration',
    expectedCadenceMinutes: 24 * 60,
  },
  {
    id: 'publish_worker',
    displayName: 'Publish worker',
    owner: 'publish worker',
    expectedCadenceMinutes: 15,
  },
  {
    id: 'geocode_cron',
    displayName: 'Geocode cron',
    owner: 'geocode cron',
    expectedCadenceMinutes: 15,
  },
  {
    id: 'catalog_repair',
    displayName: 'Catalog repair',
    owner: 'catalog-repair cron',
    expectedCadenceMinutes: 60,
  },
  {
    id: 'missing_ingest',
    displayName: 'Missing URL ingestion',
    owner: 'missing-ingest cron',
    expectedCadenceMinutes: 60,
  },
  {
    id: 'coverage_audit',
    displayName: 'Coverage audit',
    owner: 'coverage audit',
    expectedCadenceMinutes: 24 * 60,
  },
  {
    id: 'duplicate_canonical_slo',
    displayName: 'Duplicate canonical SLO',
    owner: 'duplicate-canonical-slo cron',
    expectedCadenceMinutes: 24 * 60,
  },
  {
    id: 'existing_refresh',
    displayName: 'Existing URL refresh',
    owner: 'existing-refresh cron',
    expectedCadenceMinutes: 60,
  },
] as const

export function buildSchedulerCronHealth(
  coverage: YstmCoverageMetricsResponse | null
): SchedulerCronRow[] {
  const missing = coverage?.missingIngestCronHealth

  return CRITICAL_INGESTION_CRONS.map((cron) => {
    if (cron.id === 'missing_ingest' && missing) {
      const state = missing.crashLoopDetected
        ? 'crash_loop'
        : missing.minutesSinceCompletion != null &&
            cron.expectedCadenceMinutes != null &&
            missing.minutesSinceCompletion > cron.expectedCadenceMinutes * 2
          ? 'stale'
          : missing.lastCompletedAt
            ? 'ok'
            : 'unknown'
      return {
        id: cron.id,
        displayName: cron.displayName,
        owner: cron.owner,
        expectedCadenceMinutes: cron.expectedCadenceMinutes,
        lastSuccessAt: missing.lastCompletedAt,
        minutesSinceSuccess: missing.minutesSinceCompletion,
        state,
        failureCount24h: null,
        crashLoopDetected: missing.crashLoopDetected,
      }
    }

    if (cron.id === 'coverage_audit' && coverage?.lastAuditAt) {
      const completedMs = Date.parse(coverage.lastAuditAt)
      const minutesSince = Number.isFinite(completedMs)
        ? Math.round(((Date.now() - completedMs) / 60_000) * 10) / 10
        : null
      const stale =
        minutesSince != null && minutesSince > cron.expectedCadenceMinutes * 1.5
      return {
        id: cron.id,
        displayName: cron.displayName,
        owner: cron.owner,
        expectedCadenceMinutes: cron.expectedCadenceMinutes,
        lastSuccessAt: coverage.lastAuditAt,
        minutesSinceSuccess: minutesSince,
        state: stale ? 'stale' : 'ok',
        failureCount24h: null,
        crashLoopDetected: false,
      }
    }

    return {
      id: cron.id,
      displayName: cron.displayName,
      owner: cron.owner,
      expectedCadenceMinutes: cron.expectedCadenceMinutes,
      lastSuccessAt: null,
      minutesSinceSuccess: null,
      state: 'unknown',
      failureCount24h: null,
      crashLoopDetected: false,
    }
  })
}
