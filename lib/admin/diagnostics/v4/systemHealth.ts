import {
  CATALOG_REPAIR_SLO_MAX,
  HOT_PATH_OLDEST_AGE_MS,
  HOT_PATH_QUEUE_MIN,
  REFRESH_STALE_ELEVATED_MIN,
  SEVERE_VISIBILITY_FAILURE_MIN_COUNT,
  SEVERE_VISIBILITY_FAILURE_MIN_RATE,
  VISIBILITY_SAMPLE_HIGH_COVERAGE_PCT,
} from '@/lib/admin/diagnostics/v4/constants'
import type {
  ComputedAlert,
  HealthReason,
  OperationalDomain,
  SchedulerCronRow,
  SloEvaluationRow,
  SystemHealthAssessment,
  SystemHealthLevel,
  VisibilitySnapshot,
} from '@/lib/admin/diagnostics/v4/types'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

export function isSevereVisibilityFailure(
  visibility: VisibilitySnapshot,
  publishedActiveInventory: number
): boolean {
  if (
    visibility.classificationConfidence === 'LOW' ||
    visibility.classificationMode === 'SAMPLE_ONLY'
  ) {
    if (
      visibility.auditedCoveragePct == null ||
      visibility.auditedCoveragePct < VISIBILITY_SAMPLE_HIGH_COVERAGE_PCT
    ) {
      return false
    }
  }

  const count = visibility.trueVisibilityFailureCount
  if (count >= SEVERE_VISIBILITY_FAILURE_MIN_COUNT) return true
  if (publishedActiveInventory > 0) {
    return count / publishedActiveInventory >= SEVERE_VISIBILITY_FAILURE_MIN_RATE
  }
  return false
}

function isGeocodeOutageBlockingPublish(metrics: IngestionMetricsResponse): boolean {
  const eligible = metrics.geocodeEligibleBacklog
  const ready = metrics.volume.publish.readyCount
  const oldestGeocode = metrics.volume.geocode.oldestNeedsGeocodeAgeMs ?? 0
  return (
    eligible >= HOT_PATH_QUEUE_MIN &&
    ready > 0 &&
    oldestGeocode >= HOT_PATH_OLDEST_AGE_MS
  )
}

function isUserPathCronCritical(crons: readonly SchedulerCronRow[]): boolean {
  const userPathIds = new Set(['daily_orchestration', 'publish_worker', 'geocode_cron'])
  return crons.some((cron) => {
    if (!userPathIds.has(cron.id)) return false
    if (cron.state === 'crash_loop' || cron.state === 'failed') return true
    if (cron.state !== 'late') return false
    const cadence = cron.expectedCadenceMinutes ?? 0
    const mins = cron.minutesSinceSuccess ?? 0
    return cadence > 0 && mins > cadence * 2
  })
}

function reason(
  id: string,
  label: string,
  domain: OperationalDomain
): HealthReason {
  return { id, label, domain }
}

export function deriveSystemHealthAssessment(input: {
  blockingSloFailures: readonly SloEvaluationRow[]
  nonBlockingSloFailures: readonly SloEvaluationRow[]
  alerts: readonly ComputedAlert[]
  catalogRepairQueue: number
  refreshStale: number
  metrics: IngestionMetricsResponse
  visibility: VisibilitySnapshot
  publishedActiveInventory: number
  schedulerCrons: readonly SchedulerCronRow[]
}): SystemHealthAssessment {
  const reasons: HealthReason[] = []

  for (const slo of input.blockingSloFailures) {
    reasons.push(reason(`slo_${slo.id}`, `Blocking SLO failure: ${slo.label}`, 'slos'))
  }

  const criticalImpactAlerts = input.alerts.filter(
    (a) => a.severity === 'critical' && a.blockingUserImpact
  )
  for (const alert of criticalImpactAlerts) {
    if (!reasons.some((r) => r.id === alert.id)) {
      reasons.push(reason(alert.id, alert.trigger, alert.domain))
    }
  }

  if (isGeocodeOutageBlockingPublish(input.metrics)) {
    reasons.push(
      reason(
        'geocode_blocking_publish',
        'Geocode backlog blocking publish-ready rows',
        'geocoding'
      )
    )
  }

  if (isUserPathCronCritical(input.schedulerCrons)) {
    reasons.push(
      reason(
        'user_path_cron_late',
        'User-path cron late beyond 2× expected cadence',
        'scheduler_cron'
      )
    )
  }

  if (isSevereVisibilityFailure(input.visibility, input.publishedActiveInventory)) {
    reasons.push(
      reason(
        'severe_visibility_failure',
        `${input.visibility.trueVisibilityFailureCount} high-confidence visibility failure(s)`,
        'visibility_coverage'
      )
    )
  }

  if (reasons.length > 0) {
    return { level: 'critical', reasons }
  }

  for (const slo of input.nonBlockingSloFailures) {
    reasons.push(reason(`slo_${slo.id}`, `SLO miss: ${slo.label}`, 'slos'))
  }

  const warnings = input.alerts.filter((a) => a.severity === 'warning')
  for (const alert of warnings) {
    reasons.push(reason(alert.id, alert.trigger, alert.domain))
  }

  if (input.catalogRepairQueue >= CATALOG_REPAIR_SLO_MAX) {
    reasons.push(
      reason(
        'catalog_repair_elevated',
        `Catalog repair queue ${input.catalogRepairQueue} ≥ ${CATALOG_REPAIR_SLO_MAX}`,
        'catalog_repair'
      )
    )
  }

  if (input.refreshStale >= REFRESH_STALE_ELEVATED_MIN) {
    reasons.push(
      reason(
        'refresh_stale_elevated',
        `Refresh stale backlog ${input.refreshStale.toLocaleString()} elevated`,
        'backlog_queues'
      )
    )
  }

  const infoAlerts = input.alerts.filter((a) => a.severity === 'info')
  if (infoAlerts.length > 0 && reasons.length === 0) {
    for (const alert of infoAlerts.slice(0, 2)) {
      reasons.push(reason(alert.id, alert.trigger, alert.domain))
    }
  }

  if (reasons.length > 0) {
    return { level: 'degraded', reasons }
  }

  return { level: 'healthy', reasons: [] }
}

export function deriveSystemHealthLevel(
  blockingSloFailures: readonly SloEvaluationRow[],
  alerts: readonly ComputedAlert[],
  catalogRepairQueue: number
): SystemHealthLevel {
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && a.blockingUserImpact)
  if (blockingSloFailures.length > 0 || criticalAlerts.length > 0) {
    return 'critical'
  }
  const warnings = alerts.filter((a) => a.severity === 'warning')
  if (warnings.length > 0 || catalogRepairQueue >= CATALOG_REPAIR_SLO_MAX) {
    return 'degraded'
  }
  return 'healthy'
}

export function formatSystemHealthLabel(level: SystemHealthLevel): string {
  switch (level) {
    case 'healthy':
      return 'Healthy'
    case 'degraded':
      return 'Degraded'
    case 'critical':
      return 'Critical'
  }
}

export function buildTrendSummary(
  coverage: import('@/lib/admin/ystmCoverageMetricsTypes').YstmCoverageMetricsResponse | null
): string {
  if (!coverage?.trend.length) {
    return 'Trend unavailable (no_snapshot_history)'
  }
  const last = coverage.trend[coverage.trend.length - 1]
  const prev = coverage.trend.length > 1 ? coverage.trend[coverage.trend.length - 2] : null
  if (last.coveragePct == null) return 'Trend unavailable (no_snapshot_history)'
  if (prev?.coveragePct == null) {
    return `Coverage ${last.coveragePct.toFixed(1)}% (latest audit)`
  }
  const delta = last.coveragePct - prev.coveragePct
  const direction = delta > 0.05 ? 'improving' : delta < -0.05 ? 'degrading' : 'flat'
  return `Coverage ${direction} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp vs prior audit)`
}
