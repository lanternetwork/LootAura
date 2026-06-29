import type { ComputedAlert, SloEvaluationRow, SystemHealthLevel } from '@/lib/admin/diagnostics/v4/types'
import { PUBLISH_FAILED_SLO_MAX } from '@/lib/admin/diagnostics/v4/constants'

export function deriveSystemHealthLevel(
  blockingSloFailures: readonly SloEvaluationRow[],
  alerts: readonly ComputedAlert[],
  catalogRepairQueue: number
): SystemHealthLevel {
  if (blockingSloFailures.length > 0) {
    return 'critical'
  }

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical')
  if (criticalAlerts.length > 0) {
    return 'critical'
  }

  const publishFailedAlert = blockingSloFailures.find((s) => s.id === 'publish_failed_terminal')
  if (publishFailedAlert && !publishFailedAlert.pass) {
    return 'critical'
  }

  const warningAlerts = alerts.filter((a) => a.severity === 'warning')
  if (warningAlerts.length >= 2 || catalogRepairQueue >= 200) {
    return 'critical'
  }

  if (warningAlerts.length > 0 || catalogRepairQueue >= 100) {
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
    return 'Trend unavailable (insufficient audit history)'
  }
  const last = coverage.trend[coverage.trend.length - 1]
  const prev = coverage.trend.length > 1 ? coverage.trend[coverage.trend.length - 2] : null
  if (last.coveragePct == null) return 'Trend unavailable'
  if (prev?.coveragePct == null) {
    return `Coverage ${last.coveragePct.toFixed(1)}% (latest audit)`
  }
  const delta = last.coveragePct - prev.coveragePct
  const direction = delta > 0.05 ? 'improving' : delta < -0.05 ? 'degrading' : 'flat'
  return `Coverage ${direction} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp vs prior audit)`
}

export function isPublishFailedCritical(count: number): boolean {
  return count > PUBLISH_FAILED_SLO_MAX
}
