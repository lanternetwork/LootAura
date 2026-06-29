import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import { formatSystemHealthLabel } from '@/lib/admin/diagnostics/v4/systemHealth'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { buildExportMetadata, formatExportHeader } from '@/lib/admin/diagnostics/v4/export/exportMetadata'

function buildV4OperationalSections(model: IngestionDiagnosticsModel): string {
  const lines: string[] = [
    '## V4 Operational Summary',
    diagnosticBullet('overall health', formatSystemHealthLabel(model.systemHealth)),
    diagnosticBullet('primary bottleneck', `${model.primaryBottleneck.label} — ${model.primaryBottleneck.reason}`),
    diagnosticBullet('trend summary', model.trendSummary),
    '',
    '### Pipeline (24h)',
  ]

  for (const stage of model.pipeline) {
    lines.push(diagnosticBullet(stage.stage, stage.available ? stage.count24h : 'unavailable'))
  }

  lines.push('', '### Catalog Repair')
  lines.push(diagnosticBullet('queue total', model.catalogRepair.queueTotal))
  lines.push(diagnosticBullet('needs_check (exclusive)', model.catalogRepair.needsCheck))
  lines.push(diagnosticBullet('needs_geocode (exclusive)', model.catalogRepair.needsGeocode))
  lines.push(diagnosticBullet('publish_failed (exclusive)', model.catalogRepair.publishFailed))
  lines.push(diagnosticBullet('repair_failed (exclusive)', model.catalogRepair.repairFailed))
  lines.push(diagnosticBullet('address enrichment (exclusive)', model.catalogRepair.addressEnrichment))
  lines.push(diagnosticBullet('dominant blocker', model.catalogRepair.dominantBlocker ?? '—'))
  lines.push(diagnosticBullet('recommendation', model.catalogRepair.recommendation))

  lines.push('', '### Visibility (split)')
  lines.push(diagnosticBullet('observation stale', model.visibility.observationStale))
  lines.push(diagnosticBullet('true visibility failure', model.visibility.trueVisibilityFailure))
  lines.push(diagnosticBullet('published_not_visible total', model.visibility.publishedNotVisibleTotal))

  lines.push('', '### Duplicate Detection (split)')
  lines.push(diagnosticBullet('canonical publish clusters', model.duplicates.canonicalPublishClusters))
  lines.push(
    diagnosticBullet(
      'convergence streak',
      `${model.duplicates.convergenceStreakDays} / ${model.duplicates.convergenceStreakTargetDays} UTC days`
    )
  )
  lines.push(diagnosticBullet('visible duplicate clusters', model.duplicates.visibleDuplicateClusters))
  lines.push(
    diagnosticBullet(
      'visible duplicate rate',
      model.duplicates.visibleDuplicateRate == null
        ? '—'
        : `${(model.duplicates.visibleDuplicateRate * 100).toFixed(2)}%`
    )
  )
  lines.push(diagnosticBullet('shadow divergence', model.duplicates.shadowDivergenceCount))

  lines.push('', '### Scheduler & Cron Health')
  for (const cron of model.schedulerCrons) {
    lines.push(
      diagnosticBullet(
        cron.displayName,
        `state=${cron.state}; last=${cron.lastSuccessAt ?? '—'}; mins=${cron.minutesSinceSuccess ?? '—'}; owner=${cron.owner}`
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

  return lines.join('\n')
}

/**
 * Engineering report = V4 operational summary + legacy full clipboard (parity superset).
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
    '## Legacy Engineering Detail (parity)',
    '',
    legacy,
  ].join('\n')
}
