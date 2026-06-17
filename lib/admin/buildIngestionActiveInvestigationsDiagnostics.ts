import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import { evaluateYstmIngestionRepairProgram } from '@/lib/admin/evaluateYstmIngestionRepairProgram'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateYstmStabilizationExit, STABILIZATION_CATALOG_REPAIR_MAX } from '@/lib/admin/ystmStabilizationExitCriteria'

export type InvestigationStatus =
  | 'OPEN'
  | 'MONITORING'
  | 'BURN_IN'
  | 'VERIFIED'
  | 'CLOSED'
  | 'BLOCKED'

type InvestigationRow = {
  track: string
  status: InvestigationStatus
}

function repairWorkstreamBStatus(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): InvestigationStatus {
  const repairQueue =
    coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? 0
  const needsCheck = metrics.failureBreakdown.needs_check
  if (repairQueue >= STABILIZATION_CATALOG_REPAIR_MAX) return 'OPEN'
  if (repairQueue > 0 || needsCheck > 0) return 'MONITORING'
  return 'CLOSED'
}

function enrichmentDrainStatus(metrics: IngestionMetricsResponse): InvestigationStatus {
  const cohort = metrics.addressEnrichmentDrainCohort
  const backlog = metrics.volume.addressLifecycle.enrichmentBacklog
  if (!cohort && backlog === 0) return 'CLOSED'
  const never = cohort?.byFailureSubtype.never_attempted ?? 0
  const waiting = cohort?.byClassification.waiting ?? 0
  if (never > 0 || waiting > 0 || backlog >= 50) return 'OPEN'
  if (backlog > 0) return 'MONITORING'
  return 'CLOSED'
}

export function buildIngestionActiveInvestigationsDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string {
  const rows: InvestigationRow[] = []

  rows.push({
    track: 'ADDRESS_ENRICHMENT_DRAIN',
    status: enrichmentDrainStatus(metrics),
  })

  rows.push({
    track: 'CATALOG_REPAIR_BACKLOG',
    status: repairWorkstreamBStatus(metrics, coverage),
  })

  if (coverage?.discoveryFreshness) {
    rows.push({ track: 'DISCOVERY_FRESHNESS', status: 'BURN_IN' })
  }

  if (coverage) {
    const missing =
      coverage.missingValidYstmUrls > 0 ||
      Object.keys(coverage.missingByMetro).length > 0 ||
      Object.keys(coverage.missingByState).length > 0
    if (missing) {
      rows.push({ track: 'STRATEGIC_METRO_COVERAGE', status: 'MONITORING' })
    }
  }

  rows.push({ track: 'VIEW_SALE', status: 'VERIFIED' })

  const stabilization = evaluateYstmStabilizationExit(metrics, coverage)
  rows.push({
    track: 'SEO_UNBLOCK',
    status: stabilization.tier1Ready ? 'MONITORING' : 'BLOCKED',
  })

  if (coverage) {
    const program = evaluateYstmIngestionRepairProgram(metrics, coverage)
    for (const ws of program.workstreams) {
      if (ws.id === 'A' && ws.status === 'blocked') {
        const existing = rows.find((r) => r.track === 'DUPLICATE_CANONICAL_CLUSTERS')
        if (!existing) {
          rows.push({ track: 'DUPLICATE_CANONICAL_CLUSTERS', status: 'BLOCKED' })
        }
      }
    }
  }

  const visible = rows.filter((row) => row.status !== 'CLOSED')

  const lines = ['## ACTIVE INVESTIGATIONS']
  if (visible.length === 0) {
    lines.push(diagnosticBullet('status', 'No open investigations in current snapshot'))
  } else {
    for (const row of visible) {
      lines.push(diagnosticBullet(row.track, row.status))
    }
  }

  return lines.join('\n')
}
