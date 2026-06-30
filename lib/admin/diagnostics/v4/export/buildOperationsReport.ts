import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import { formatSystemHealthLabel } from '@/lib/admin/diagnostics/v4/systemHealth'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { buildExportMetadata, formatExportHeader } from '@/lib/admin/diagnostics/v4/export/exportMetadata'

export function buildOperationsReport(model: IngestionDiagnosticsModel): string {
  const metadata = buildExportMetadata(model, 'operations')
  const lines = [
    ...formatExportHeader(metadata, 'Ingestion Operations Report'),
    '## System Health',
    diagnosticBullet('overall health', formatSystemHealthLabel(model.systemHealth)),
    diagnosticBullet('primary bottleneck', model.primaryBottleneck.label),
    diagnosticBullet('bottleneck reason', model.primaryBottleneck.reason),
    diagnosticBullet('last refresh', model.generatedAt),
    diagnosticBullet('trend summary', model.trendSummary),
    '',
    '## Active Alerts',
  ]

  if (model.alerts.length === 0) {
    lines.push(diagnosticBullet('status', 'No active alerts'))
  } else {
    for (const alert of model.alerts.slice(0, 8)) {
      lines.push(
        diagnosticBullet(
          `${alert.severity}: ${alert.id}`,
          `${alert.reason} — ${alert.recommendedAction}`
        )
      )
    }
  }

  lines.push('', '## SLO Status')
  for (const slo of model.slos) {
    lines.push(
      diagnosticBullet(
        slo.id,
        `[${slo.pass ? 'PASS' : 'FAIL'}] ${slo.label}: ${slo.actual} (target ${slo.target})`
      )
    )
  }

  lines.push('', '## Top Operator Actions')
  for (const action of model.operatorActions) {
    lines.push(
      diagnosticBullet(
        action.severity,
        `${action.issue} → ${action.action} (owner: ${action.owner})`
      )
    )
  }

  lines.push('', '## Queue Summary')
  lines.push(diagnosticBullet('catalog repair', model.backlogs.catalogRepair))
  lines.push(diagnosticBullet('needs_check', model.catalogRepair.needsCheck))
  lines.push(diagnosticBullet('address enrichment', model.backlogs.addressEnrichment))
  lines.push(diagnosticBullet('geocode eligible', model.backlogs.geocodeEligible))
  lines.push(diagnosticBullet('publish_failed', model.backlogs.publishFailed))
  lines.push(diagnosticBullet('missing ingest', model.backlogs.missingIngest))
  lines.push(diagnosticBullet('refresh stale', model.backlogs.refreshStale))

  return lines.join('\n')
}
