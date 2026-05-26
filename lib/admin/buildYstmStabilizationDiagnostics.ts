import { evaluateYstmStabilizationExit } from '@/lib/admin/ystmStabilizationExitCriteria'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? value.toLocaleString('en-US') : value}`
}

/**
 * Markdown block for YSTM stabilization Tier 1 / Tier 2 exit criteria (clipboard / support).
 */
export function buildYstmStabilizationDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse
): string {
  const exit = evaluateYstmStabilizationExit(metrics, coverage)

  const lines: string[] = [
    '## YSTM stabilization exit (before ES.net resume)',
    bullet('tier1 snapshot', exit.tier1Ready ? 'pass' : 'not met'),
    bullet('tier2 snapshot', exit.tier2Ready ? 'pass' : 'not met'),
    bullet('hold note', exit.holdNote),
    '',
    '### Tier 1',
    ...exit.tier1Criteria.map(
      (c) => `- [${c.status.toUpperCase()}] ${c.label}: ${c.detail}`
    ),
    '',
    '### Tier 2',
    ...exit.tier2Criteria.map(
      (c) => `- [${c.status.toUpperCase()}] ${c.label}: ${c.detail}`
    ),
  ]

  return lines.join('\n')
}
