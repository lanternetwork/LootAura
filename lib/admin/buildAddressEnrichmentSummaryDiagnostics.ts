import { diagnosticBullet, formatDiagnosticPct } from '@/lib/admin/diagnosticsMarkdown'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function publishabilityBlockedPct(metrics: IngestionMetricsResponse): number | null {
  const analysis = metrics.needsCheckRootCauseAnalysis
  if (!analysis || analysis.total <= 0) return null
  const blocked =
    (analysis.byPublishability.blocked_by_enrichment ?? 0) +
    (analysis.byPublishability.blocked_by_precision ?? 0) +
    (analysis.byPublishability.blocked_by_geocode ?? 0) +
    (analysis.byPublishability.blocked_by_other ?? 0)
  return blocked / analysis.total
}

function deriveInterpretation(metrics: IngestionMetricsResponse): string {
  const cohort = metrics.addressEnrichmentDrainCohort
  const never = cohort?.byFailureSubtype.never_attempted ?? 0
  const waiting = cohort?.byClassification.waiting ?? 0
  const total = cohort?.total ?? 0

  if (total > 0 && never / total >= 0.5) {
    return 'Enrichment not draining. Rows appear scheduler-starved.'
  }
  if (waiting > 0 && never === 0) {
    return 'Enrichment cohort waiting on scheduler eligibility.'
  }
  if (metrics.volume.addressLifecycle.enrichmentBacklog > 0) {
    return 'Address enrichment backlog present; monitor drain crons.'
  }
  return 'Enrichment queues within normal operating range.'
}

export function buildAddressEnrichmentSummaryDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string {
  const repairQueue =
    coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0
  const needsCheck = metrics.failureBreakdown.needs_check
  const cohort = metrics.addressEnrichmentDrainCohort
  const overlapPct = repairQueue > 0 ? (needsCheck / repairQueue) * 100 : null
  const blockedPct = publishabilityBlockedPct(metrics)

  const lines = [
    '## ADDRESS ENRICHMENT',
    diagnosticBullet('repair_queue', repairQueue),
    diagnosticBullet('needs_check', needsCheck),
    diagnosticBullet('never_attempted', cohort?.byFailureSubtype.never_attempted ?? 0),
    diagnosticBullet('waiting', cohort?.byClassification.waiting ?? 0),
    diagnosticBullet(
      'enrichment_pending',
      metrics.volume.addressLifecycle.enrichmentBacklog
    ),
    diagnosticBullet(
      'overlap_pct',
      overlapPct != null ? `${overlapPct.toFixed(1)}%` : '—'
    ),
    diagnosticBullet(
      'publishability_blocked_pct',
      blockedPct != null ? formatDiagnosticPct(blockedPct) : '—'
    ),
    diagnosticBullet('interpretation', deriveInterpretation(metrics)),
  ]

  return lines.join('\n')
}
