import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import { formatSystemHealthLabel } from '@/lib/admin/diagnostics/v4/systemHealth'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import {
  buildExportMetadata,
  formatExportHeader,
  formatExportNotes,
} from '@/lib/admin/diagnostics/v4/export/exportMetadata'
import { buildDiagnosticsPerformanceSection } from '@/lib/admin/diagnostics/v4/export/buildDiagnosticsPerformanceSection'

export function buildOperationsReport(model: IngestionDiagnosticsModel): string {
  const metadata = buildExportMetadata(model, 'operations')
  const lines = [
    ...formatExportHeader(metadata, 'Ingestion Operations Report'),
    '## SYSTEM STATUS',
    diagnosticBullet('overall health', formatSystemHealthLabel(model.systemHealth)),
    ...model.healthReasons.slice(0, 6).map((r) => diagnosticBullet(`reason: ${r.id}`, r.label)),
    diagnosticBullet('trend summary', model.trendSummary),
    '',
    '## DOMAIN HEALTH',
  ]

  for (const domain of model.domainHealth) {
    lines.push(
      diagnosticBullet(
        domain.label,
        `${domain.status.toUpperCase()} — ${domain.primaryReason}`
      )
    )
  }

  lines.push('', '## ACTIVE ALERTS')
  if (model.alerts.length === 0) {
    lines.push(diagnosticBullet('status', 'No active alerts'))
  } else {
    for (const alert of model.alerts.slice(0, 8)) {
      lines.push(
        diagnosticBullet(
          `${alert.severity}/${alert.confidence}: ${alert.id}`,
          `${alert.trigger} (${alert.currentValue} vs ${alert.threshold})`
        )
      )
    }
  }

  lines.push('', '## SLO SUMMARY')
  for (const slo of model.slos) {
    lines.push(
      diagnosticBullet(
        slo.id,
        `[${slo.pass ? 'PASS' : 'FAIL'}] ${slo.actual} (target ${slo.target})`
      )
    )
  }

  lines.push('', '## BOTTLENECK')
  lines.push(diagnosticBullet('label', model.primaryBottleneck.label))
  lines.push(diagnosticBullet('type', model.primaryBottleneck.type))
  lines.push(diagnosticBullet('reason', model.primaryBottleneck.reason))
  if (model.primaryBottleneck.secondaryPressures.length > 0) {
    lines.push(
      diagnosticBullet(
        'secondary pressures',
        model.primaryBottleneck.secondaryPressures
          .map((p) => `${p.label} (${p.count.toLocaleString()})`)
          .join('; ')
      )
    )
  }

  lines.push('', '## TOP OPERATOR ACTIONS')
  for (const action of model.operatorActions) {
    lines.push(
      diagnosticBullet(
        action.severity,
        `${action.issue} → ${action.action} (owner: ${action.owner})`
      )
    )
  }

  lines.push('', '## SCHEDULER HEALTH SUMMARY')
  const ok = model.schedulerCrons.filter((c) => c.state === 'ok').length
  lines.push(diagnosticBullet('ok / total', `${ok}/${model.schedulerCrons.length}`))
  for (const cron of model.schedulerCrons.filter((c) => c.state !== 'ok').slice(0, 4)) {
    lines.push(
      diagnosticBullet(
        cron.displayName,
        `${cron.state}${cron.telemetryUnavailableReason ? ` (${cron.telemetryUnavailableReason})` : ''}`
      )
    )
  }

  lines.push('', '## QUEUE SUMMARY')
  lines.push(diagnosticBullet('catalog repair', model.backlogs.catalogRepair))
  lines.push(diagnosticBullet('refresh stale', model.backlogs.refreshStale))
  lines.push(diagnosticBullet('needs_check', model.catalogRepair.needsCheck))
  lines.push(diagnosticBullet('geocode eligible', model.backlogs.geocodeEligible))
  lines.push(diagnosticBullet('missing ingest', model.backlogs.missingIngest))

  lines.push('', ...buildDiagnosticsPerformanceSection(model, 'operations'))
  lines.push('', ...formatExportNotes())

  const report = lines.join('\n')
  const lineCount = report.split('\n').length
  if (lineCount > 150) {
    return `${report}\n\n<!-- operations_report_lines: ${lineCount} (target ≤150; content prioritized) -->`
  }
  return report
}
