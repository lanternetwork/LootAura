import { evaluateYstmIngestionRepairProgram } from '@/lib/admin/evaluateYstmIngestionRepairProgram'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { NeedsCheckBreakdown } from '@/lib/admin/countNeedsCheckBreakdown'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? value.toLocaleString('en-US') : value}`
}

/**
 * Markdown block for YSTM ingestion repair program (PR #532) — clipboard / weekly ops review.
 */
export function buildYstmIngestionRepairDiagnostics(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse
): string {
  const program = evaluateYstmIngestionRepairProgram(metrics, coverage)
  const breakdown = metrics.needsCheckBreakdown

  const lines: string[] = [
    '## YSTM ingestion repair program (SEO allowlist unblock)',
    bullet('tier1 snapshot', program.tier1Ready ? 'pass' : 'not met'),
    bullet('tier2 repair snapshot', program.tier2RepairReady ? 'pass' : 'not met'),
    bullet('seo unblock tier1', program.seoUnblockTier1Ready ? 'ready for 7-day hold' : 'blocked'),
    bullet('hold note', program.holdNote),
    '',
    '### Workstreams A–G',
    ...program.workstreams.map(
      (w) =>
        `- [${w.status.toUpperCase()}] ${w.id}. ${w.title} (${w.priority}): ${w.metric} — ${w.action}`
    ),
  ]

  if (program.falseExclusionBuckets.length > 0) {
    lines.push('', '### False-exclusion buckets (missing valid URLs)')
    for (const row of program.falseExclusionBuckets) {
      lines.push(`- ${row.bucket}: ${row.count.toLocaleString()} — ${row.action}`)
    }
  }

  if (breakdown && breakdown.total > 0) {
    lines.push(
      '',
      '### needs_check breakdown',
      bullet('total needs_check', breakdown.total),
      bullet('scanned', breakdown.scanned)
    )
    lines.push('', 'By address_status:')
    for (const [status, count] of Object.entries(breakdown.byAddressStatus).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${status}: ${count.toLocaleString()}`)
    }
    lines.push('', 'By coordinate_precision:')
    for (const [precision, count] of Object.entries(breakdown.byCoordinatePrecision).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`- ${precision}: ${count.toLocaleString()}`)
    }
    if (breakdown.topPairs.length > 0) {
      lines.push('', 'Top address_status × coordinate_precision pairs:')
      for (const pair of breakdown.topPairs) {
        lines.push(
          `- ${pair.addressStatus} × ${pair.coordinatePrecision}: ${pair.count.toLocaleString()}`
        )
      }
    }
  }

  return lines.join('\n')
}
