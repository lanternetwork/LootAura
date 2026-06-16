import { diagnosticsBullet } from '@/lib/admin/diagnosticsMarkdown'
import type { CoverageTieredSchedulerState } from '@/lib/ingestion/ystmCoverage/coverageTieredSchedulerMode'

/**
 * Markdown for coverage tiered audit scheduler runtime state.
 */
export function buildCoverageTieredSchedulerDiagnostics(
  state: CoverageTieredSchedulerState
): string {
  return [
    '## Coverage tiered audit scheduler',
    diagnosticsBullet('enabled', state.enabled ? 'ON' : 'OFF'),
    diagnosticsBullet('enabledAt', state.enabledAt ?? '—'),
    diagnosticsBullet('legacy cursor (cursor)', state.legacyCursor),
    diagnosticsBullet('long-tail cursor', state.longTailCursor),
    diagnosticsBullet(
      'note',
      'Legacy cursor frozen while tiered mode is ON; Tier 1 stale strategic metros first, Tier 2 long-tail round-robin'
    ),
  ].join('\n')
}
