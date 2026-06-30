import { buildOperationalPriorities } from '@/lib/admin/ingestionDashboardOverview'
import { getRegistryEntry } from '@/lib/admin/diagnostics/v4/registry'
import { VISIBLE_DUPLICATE_RATE_MAX, ACTIONABLE_MISSING_SLO_MAX } from '@/lib/admin/diagnostics/v4/constants'
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

function alertRow(
  partial: Omit<ComputedAlert, 'reason'> & { reason?: string }
): ComputedAlert {
  return {
    reason: partial.trigger,
    ...partial,
  }
}

export function buildComputedAlerts(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  blockingSloFailures: readonly SloEvaluationRow[],
  nonBlockingSloFailures: readonly SloEvaluationRow[]
): ComputedAlert[] {
  const alerts: ComputedAlert[] = []

  for (const slo of blockingSloFailures) {
    const entry = getRegistryEntry(slo.id)
    alerts.push(
      alertRow({
        id: `slo_${slo.id}`,
        severity: 'critical',
        domain: entry?.operationalDomain ?? 'slos',
        trigger: slo.label,
        currentValue: slo.actual,
        threshold: slo.target,
        confidence: 'HIGH',
        affectedMetricIds: [slo.id],
        owner: entry?.owner ?? 'ingestion ops',
        recommendedAction: `Resolve blocking SLO: ${slo.label}`,
        blockingUserImpact: true,
      })
    )
  }

  for (const slo of nonBlockingSloFailures) {
    const entry = getRegistryEntry(slo.id)
    alerts.push(
      alertRow({
        id: `slo_${slo.id}`,
        severity: 'warning',
        domain: entry?.operationalDomain ?? 'slos',
        trigger: slo.label,
        currentValue: slo.actual,
        threshold: slo.target,
        confidence: 'HIGH',
        affectedMetricIds: [slo.id],
        owner: entry?.owner ?? 'ingestion ops',
        recommendedAction: `Address SLO miss: ${slo.label}`,
        blockingUserImpact: false,
      })
    )
  }

  const duplicates = buildDuplicateHealthSnapshot(coverage)
  if (exceedsVisibleDuplicateThreshold(duplicates.visibleDuplicateRate)) {
    const rate = duplicates.visibleDuplicateRate ?? 0
    alerts.push(
      alertRow({
        id: 'visible_duplicate_rate',
        severity: 'warning',
        domain: 'duplicate_detection',
        trigger: 'Visible duplicate rate elevated',
        currentValue: `${(rate * 100).toFixed(2)}%`,
        threshold: `<${(VISIBLE_DUPLICATE_RATE_MAX * 100).toFixed(2)}%`,
        confidence: 'HIGH',
        affectedMetricIds: ['visible_duplicate_clusters'],
        owner: 'manual review',
        recommendedAction: 'Review visible duplicate clusters before enforcement.',
        blockingUserImpact: false,
      })
    )
  }

  if (duplicates.shadowDivergenceCount > 0) {
    alerts.push(
      alertRow({
        id: 'shadow_divergence',
        severity: 'warning',
        domain: 'duplicate_detection',
        trigger: 'Shadow replay divergence pending review',
        currentValue: duplicates.shadowDivergenceCount.toLocaleString(),
        threshold: '0',
        confidence: 'HIGH',
        affectedMetricIds: ['rollout_gates'],
        owner: 'engineering',
        recommendedAction: 'Review legacy-suppress → new-publish divergences before enforcement.',
        blockingUserImpact: false,
      })
    )
  }

  const visibility = buildVisibilitySnapshot(metrics, coverage)
  if (visibility.trueVisibilityFailureCount > 0) {
    alerts.push(
      alertRow({
        id: 'true_visibility_failure',
        severity: 'warning',
        domain: 'visibility_coverage',
        trigger: 'True visibility failure(s) in published_not_visible cohort',
        currentValue: `${visibility.trueVisibilityFailureCount} (${visibility.classificationMode})`,
        threshold: '0',
        confidence: visibility.classificationConfidence,
        affectedMetricIds: ['observation_stale'],
        owner: 'observation refresh',
        recommendedAction: 'Investigate ends_at, precision, moderation — no blind republish.',
        blockingUserImpact: false,
      })
    )
  }

  if (visibility.observationStaleCount > 0) {
    alerts.push(
      alertRow({
        id: 'observation_stale',
        severity: 'info',
        domain: 'visibility_coverage',
        trigger: 'Observation stale rows (sale visible, observation stale)',
        currentValue: visibility.observationStaleCount.toLocaleString(),
        threshold: '0',
        confidence: visibility.classificationConfidence,
        affectedMetricIds: ['observation_stale'],
        owner: 'observation refresh',
        recommendedAction: 'Reconcile stale coverage observations; do not force-publish.',
        blockingUserImpact: false,
      })
    )
  }

  const actionableMissing = coverage?.actionableMissingValid?.effectiveMissingValidYstmUrls
  if (actionableMissing != null && actionableMissing > ACTIONABLE_MISSING_SLO_MAX) {
    alerts.push(
      alertRow({
        id: 'actionable_missing_valid',
        severity: 'warning',
        domain: 'visibility_coverage',
        trigger: 'Actionable missing valid URLs above SLO',
        currentValue: actionableMissing.toLocaleString(),
        threshold: `≤${ACTIONABLE_MISSING_SLO_MAX}`,
        confidence: 'HIGH',
        affectedMetricIds: ['actionable_missing_valid'],
        owner: 'missing-ingest cron',
        recommendedAction: 'Drive false-exclusion buckets in parallel with missing-ingest.',
        blockingUserImpact: false,
      })
    )
  }

  const crawl = metrics.volume.fetch.crawlSkipTaxonomy24h
  if (crawl && crawl.total >= CRAWL_SKIP_TAXONOMY_MIN_SAMPLES) {
    const share = crawl.suspicious / crawl.total
    if (share >= CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING) {
      alerts.push(
        alertRow({
          id: 'crawl_skip_suspicious_share',
          severity: 'warning',
          domain: 'discovery',
          trigger: 'Suspicious crawl skip share elevated',
          currentValue: `${(share * 100).toFixed(1)}% (${crawl.suspicious}/${crawl.total})`,
          threshold: `≥${(CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING * 100).toFixed(0)}% when n≥${CRAWL_SKIP_TAXONOMY_MIN_SAMPLES}`,
          confidence: 'HIGH',
          affectedMetricIds: [],
          owner: 'discovery ops',
          recommendedAction: 'Sample url_match_dates_changed per crawl-skip triage runbook.',
          blockingUserImpact: false,
        })
      )
    }
  }

  return alerts
}

export function buildOperatorActions(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  alerts: readonly ComputedAlert[]
): OperatorAction[] {
  const prioritized = [...alerts].sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 }
    return rank[a.severity] - rank[b.severity]
  })

  const fromAlerts: OperatorAction[] = prioritized.slice(0, 5).map((alert) => ({
    severity: alert.severity,
    issue: alert.trigger,
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

  return merged.slice(0, 3)
}
