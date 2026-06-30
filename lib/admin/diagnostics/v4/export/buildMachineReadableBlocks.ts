import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'

export function buildMachineReadableBlocks(model: IngestionDiagnosticsModel): string {
  const lines: string[] = ['## MACHINE-READABLE BLOCKS', '']

  lines.push('SYSTEM_STATUS:')
  lines.push(`  health: ${model.systemHealth.toUpperCase()}`)
  for (const reason of model.healthReasons.slice(0, 6)) {
    lines.push(`  reason: ${reason.id} — ${reason.label}`)
  }
  lines.push('')

  for (const domain of model.domainHealth) {
    const key = domain.id.toUpperCase()
    lines.push(`${key}:`)
    lines.push(`  status: ${domain.status.toUpperCase()}`)
    lines.push(`  metric: ${domain.currentMetric}`)
    lines.push(`  threshold: ${domain.threshold}`)
    lines.push(`  owner: ${domain.owner}`)
    lines.push(`  action: ${domain.recommendedAction}`)
    lines.push('')
  }

  lines.push('BOTTLENECK:')
  lines.push(`  id: ${model.primaryBottleneck.id}`)
  lines.push(`  type: ${model.primaryBottleneck.type}`)
  lines.push(`  label: ${model.primaryBottleneck.label}`)
  for (const pressure of model.primaryBottleneck.secondaryPressures) {
    lines.push(`  secondary: ${pressure.id}=${pressure.count}`)
  }
  lines.push('')

  lines.push('VISIBILITY_SPLIT:')
  lines.push(`  published_not_visible_total: ${model.visibility.publishedNotVisibleTotal}`)
  lines.push(`  audited_count: ${model.visibility.auditedCount}`)
  lines.push(`  audited_coverage_pct: ${model.visibility.auditedCoveragePct ?? '—'}`)
  lines.push(`  classification_mode: ${model.visibility.classificationMode}`)
  lines.push(`  confidence: ${model.visibility.classificationConfidence}`)
  lines.push(`  source: ${model.visibility.attribution.source}`)
  lines.push('')

  return lines.join('\n')
}
