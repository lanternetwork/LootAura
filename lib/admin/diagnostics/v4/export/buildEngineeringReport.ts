import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import { formatSystemHealthLabel } from '@/lib/admin/diagnostics/v4/systemHealth'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import {
  buildExportMetadata,
  formatExportHeader,
  formatExportNotes,
} from '@/lib/admin/diagnostics/v4/export/exportMetadata'
import { buildMachineReadableBlocks } from '@/lib/admin/diagnostics/v4/export/buildMachineReadableBlocks'

function buildV4OperationalSections(model: IngestionDiagnosticsModel): string {
  const lines: string[] = [
    '## V4 AUTHORITATIVE SUMMARY',
    diagnosticBullet('overall health', formatSystemHealthLabel(model.systemHealth)),
    ...model.healthReasons.map((r) => diagnosticBullet(`health reason: ${r.id}`, r.label)),
    diagnosticBullet(
      'primary bottleneck',
      `${model.primaryBottleneck.label} [${model.primaryBottleneck.type}] — ${model.primaryBottleneck.reason}`
    ),
    diagnosticBullet('trend summary', model.trendSummary),
    '',
    '### Domain Health',
  ]

  for (const domain of model.domainHealth) {
    lines.push(
      diagnosticBullet(
        domain.label,
        `[${domain.status.toUpperCase()}] ${domain.currentMetric} (threshold ${domain.threshold}) — ${domain.recommendedAction}`
      )
    )
  }

  lines.push('', '### Active Alerts')
  if (model.alerts.length === 0) {
    lines.push(diagnosticBullet('status', 'No active alerts'))
  } else {
    for (const alert of model.alerts) {
      lines.push(
        diagnosticBullet(
          `${alert.severity}/${alert.confidence}: ${alert.id}`,
          `${alert.trigger} | ${alert.currentValue} vs ${alert.threshold} | blocking_user_impact=${alert.blockingUserImpact}`
        )
      )
    }
  }

  lines.push('', '### SLO Summary')
  for (const slo of model.slos) {
    lines.push(
      diagnosticBullet(
        slo.id,
        `[${slo.pass ? 'PASS' : 'FAIL'}] ${slo.actual} (target ${slo.target})`
      )
    )
  }

  lines.push('', '### Pipeline (24h)')
  for (const stage of model.pipeline) {
    lines.push(diagnosticBullet(stage.stage, stage.available ? stage.count24h : 'unavailable'))
  }

  lines.push('', '### Catalog Repair')
  lines.push(diagnosticBullet('queue total', model.catalogRepair.queueTotal))
  lines.push(diagnosticBullet('needs_check (exclusive)', model.catalogRepair.needsCheck))
  lines.push(diagnosticBullet('dominant blocker', model.catalogRepair.dominantBlocker ?? '—'))
  lines.push(diagnosticBullet('recommendation', model.catalogRepair.recommendation))

  lines.push('', '### Visibility (split + confidence)')
  lines.push(diagnosticBullet('published_not_visible total', model.visibility.publishedNotVisibleTotal))
  lines.push(diagnosticBullet('audited count', model.visibility.auditedCount))
  lines.push(
    diagnosticBullet(
      'audited coverage',
      model.visibility.auditedCoveragePct == null
        ? '—'
        : `${model.visibility.auditedCoveragePct}%`
    )
  )
  lines.push(diagnosticBullet('classification mode', model.visibility.classificationMode))
  lines.push(diagnosticBullet('classification confidence', model.visibility.classificationConfidence))
  lines.push(diagnosticBullet('observation stale', model.visibility.observationStaleCount))
  lines.push(diagnosticBullet('true visibility failure', model.visibility.trueVisibilityFailureCount))
  lines.push(diagnosticBullet('unknown unclassified', model.visibility.unknownUnclassifiedCount))
  lines.push(diagnosticBullet('source', model.visibility.attribution.source))

  lines.push('', '### Duplicate Detection')
  lines.push(diagnosticBullet('canonical publish clusters', model.duplicates.canonicalPublishClusters))
  lines.push(diagnosticBullet('visible duplicate rate', model.duplicates.visibleDuplicateRate))
  lines.push(diagnosticBullet('shadow divergence', model.duplicates.shadowDivergenceCount))

  lines.push('', '### Scheduler & Cron Health')
  for (const cron of model.schedulerCrons) {
    lines.push(
      diagnosticBullet(
        cron.displayName,
        `state=${cron.state}; last=${cron.lastSuccessAt ?? '—'}; mins=${cron.minutesSinceSuccess ?? '—'}; telemetry=${cron.telemetryUnavailableReason ?? 'ok'}`
      )
    )
  }

  if (model.seoReadiness) {
    lines.push('', '### SEO Readiness (separate from ingestion health)')
    lines.push(
      diagnosticBullet('metric gate', model.seoReadiness.metricGatePass ? 'PASS' : 'FAIL')
    )
    for (const row of model.seoReadiness.criteria) {
      lines.push(diagnosticBullet(row.label, `[${row.pass ? 'PASS' : 'FAIL'}] ${row.actual}`))
    }
  }

  lines.push('', buildMachineReadableBlocks(model))
  lines.push('', ...formatExportNotes())

  return lines.join('\n')
}

/**
 * Engineering report = V4 authoritative summary + legacy full clipboard (parity superset).
 */
export function buildEngineeringReport(model: IngestionDiagnosticsModel): string {
  const metadata = buildExportMetadata(model, 'engineering')
  const legacy = buildIngestionDiagnostics(model.metrics, {
    environment: model.environment,
    copiedAt: model.generatedAt,
    ystmCoverage: model.coverage,
  })

  return [
    ...formatExportHeader(metadata, 'Ingestion Engineering Report'),
    buildV4OperationalSections(model),
    '',
    '---',
    '',
    '## LEGACY COMPATIBILITY SECTION (non-authoritative)',
    '',
    '> Legacy health, bottleneck, and tier labels below are for migration parity only.',
    '> Use V4 SYSTEM STATUS and DOMAIN HEALTH above as source of truth.',
    '',
    legacy,
  ].join('\n')
}
