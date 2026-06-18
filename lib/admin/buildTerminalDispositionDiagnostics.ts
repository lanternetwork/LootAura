import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

export function buildTerminalDispositionDiagnostics(metrics: IngestionMetricsResponse): string {
  const terminal = metrics.terminalDisposition
  const lines = [
    '## TERMINAL ADDRESS DISPOSITION',
    diagnosticBullet('terminal_active', terminal?.terminalActive ?? 0),
    diagnosticBullet('terminal_archived', terminal?.terminalArchived ?? 0),
    diagnosticBullet(
      'needs_check_active_backlog',
      metrics.failureBreakdown.needs_check
    ),
    diagnosticBullet(
      'needs_check_legacy_including_archived',
      terminal?.needsCheckLegacyIncludingArchived ?? metrics.failureBreakdown.needs_check
    ),
  ]

  return lines.join('\n')
}
