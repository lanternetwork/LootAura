import { buildOperationalPriorities } from '@/lib/admin/ingestionDashboardOverview'
import { getRegistryEntry } from '@/lib/admin/diagnostics/v4/registry'
import type { ComputedAlert, OperatorAction, SloEvaluationRow } from '@/lib/admin/diagnostics/v4/types'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING,
  CRAWL_SKIP_TAXONOMY_MIN_SAMPLES,
} from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'
import {
  buildDuplicateHealthSnapshot,
  buildVisibilitySnapshot,
  exceedsVisibleDuplicateThreshold,
} from '@/lib/admin/diagnostics/v4/buildDomainSnapshots'

export function buildComputedAlerts(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  blockingSloFailures: readonly SloEvaluationRow[]
): ComputedAlert[] {
  const alerts: ComputedAlert[] = []

  for (const slo of blockingSloFailures) {
    const entry = getRegistryEntry(slo.id)
    alerts.push({
      id: `slo_${slo.id}`,
      severity: 'critical',
      reason: slo.label,
      affectedMetricIds: [slo.id],
      owner: entry?.owner ?? 'ingestion ops',
      recommendedAction: `Resolve blocking SLO: ${slo.label} (actual ${slo.actual}, target ${slo.target})`,
    })
  }

  const duplicates = buildDuplicateHealthSnapshot(coverage)
  if (exceedsVisibleDuplicateThreshold(duplicates.visibleDuplicateRate)) {
    alerts.push({
      id: 'visible_duplicate_rate',
      severity: 'warning',
      reason: `Visible duplicate rate ${((duplicates.visibleDuplicateRate ?? 0) * 100).toFixed(2)}% exceeds threshold`,
      affectedMetricIds: ['visible_duplicate_clusters'],
      owner: 'manual review',
      recommendedAction: 'Review visible duplicate clusters before enforcement.',
    })
  }

  const visibility = buildVisibilitySnapshot(metrics, coverage)
  if (visibility.trueVisibilityFailure > 0) {
    alerts.push({
      id: 'true_visibility_failure',
      severity: 'warning',
      reason: `${visibility.trueVisibilityFailure} true visibility failure(s) in published_not_visible cohort`,
      affectedMetricIds: ['observation_stale'],
      owner: 'observation refresh',
      recommendedAction: 'Investigate ends_at, precision, moderation — no blind republish.',
    })
  }

  if (visibility.observationStale > 0) {
    alerts.push({
      id: 'observation_stale',
      severity: 'info',
      reason: `${visibility.observationStale} observation stale row(s) (sale visible, obs stale)`,
      affectedMetricIds: ['observation_stale'],
      owner: 'observation refresh',
      recommendedAction: 'Reconcile stale coverage observations; do not force-publish.',
    })
  }

  const crawl = metrics.volume.fetch.crawlSkipTaxonomy24h
  if (crawl && crawl.total >= CRAWL_SKIP_TAXONOMY_MIN_SAMPLES) {
    const share = crawl.suspicious / crawl.total
    if (share >= CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING) {
      alerts.push({
        id: 'crawl_skip_suspicious_share',
        severity: 'warning',
        reason: `Suspicious crawl skips ${(share * 100).toFixed(1)}% of classified skips`,
        affectedMetricIds: [],
        owner: 'discovery ops',
        recommendedAction: 'Sample url_match_dates_changed per crawl-skip triage runbook.',
      })
    }
  }

  return alerts
}

export function buildOperatorActions(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  alerts: readonly ComputedAlert[]
): OperatorAction[] {
  const fromAlerts: OperatorAction[] = alerts.slice(0, 5).map((alert) => ({
    severity: alert.severity,
    issue: alert.reason,
    action: alert.recommendedAction,
    owner: alert.owner,
  }))

  if (fromAlerts.length >= 3) {
    return fromAlerts.slice(0, 3)
  }

  const legacy = buildOperationalPriorities(metrics, coverage).map((row) => ({
    severity: row.severity,
    issue: row.issue,
    action: row.suggestedAction,
    owner: 'ingestion ops',
  }))

  const merged = [...fromAlerts]
  for (const row of legacy) {
    if (merged.length >= 3) break
    if (!merged.some((m) => m.issue === row.issue)) {
      merged.push(row)
    }
  }

  while (merged.length < 3 && legacy.length > 0) {
    merged.push({
      severity: 'info',
      issue: 'No additional elevated alerts',
      action: 'Monitor queues and scheduler health.',
      owner: 'ingestion ops',
    })
    break
  }

  return merged.slice(0, 3)
}
