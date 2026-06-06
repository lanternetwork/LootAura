import {
  CATEGORY_LABELS,
  OWNER_LABELS,
} from '@/lib/admin/evaluateNeedsCheckRootCauseDiscovery'
import type { NeedsCheckRootCauseDiscovery } from '@/lib/admin/needsCheckRootCauseTypes'
import type { NeedsCheckBreakdown } from '@/lib/admin/countNeedsCheckBreakdown'

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? value.toLocaleString('en-US') : value}`
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Markdown export for NEEDS_CHECK_ROOT_CAUSE_DISCOVERY (Workstreams A–D).
 */
export function buildNeedsCheckRootCauseDiagnostics(
  discovery: NeedsCheckRootCauseDiscovery,
  breakdown: NeedsCheckBreakdown | null
): string {
  const lines: string[] = [
    '## NEEDS_CHECK_ROOT_CAUSE_DISCOVERY',
    bullet('generated at', discovery.generatedAt),
    bullet('discovery complete', discovery.discoveryComplete ? 'yes' : 'no'),
    '',
    '### Workstream A — Dashboard metrics',
    bullet('needs_check', discovery.needsCheck),
    bullet('repair_queue', discovery.repairQueue ?? '—'),
    bullet(
      'needs_check % of repair queue',
      discovery.needsCheckPctOfRepairQueue != null ? pct(discovery.needsCheckPctOfRepairQueue) : '—'
    ),
  ]

  if (breakdown && breakdown.total > 0) {
    lines.push('', '#### Address status')
    for (const [status, count] of Object.entries(breakdown.byAddressStatus).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${status}: ${count.toLocaleString()} (${pct(count / breakdown.total)})`)
    }
    lines.push('', '#### Coordinate precision')
    for (const [precision, count] of Object.entries(breakdown.byCoordinatePrecision).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`- ${precision}: ${count.toLocaleString()} (${pct(count / breakdown.total)})`)
    }
    lines.push('', '#### Top pairs (dashboard, capped)')
    for (const pair of breakdown.topPairs) {
      lines.push(
        `- ${pair.addressStatus} × ${pair.coordinatePrecision}: ${pair.count.toLocaleString()} (${pct(pair.count / breakdown.total)})`
      )
    }
  }

  lines.push(
    '',
    '### Workstream A2 — SQL analysis',
    bullet('rows scanned', discovery.analysis.scanned),
    '',
    '#### Age (by updated_at)',
  )
  for (const row of discovery.ageBuckets) {
    lines.push(`- ${row.label}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
  }

  lines.push('', '#### Failure signals (top 12)')
  for (const row of discovery.failureSignals.slice(0, 12)) {
    lines.push(`- ${row.signal}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
  }

  lines.push('', '#### Publishability')
  for (const row of discovery.publishability) {
    lines.push(`- ${row.profile}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
  }

  lines.push('', '#### Full pair distribution (top 12)')
  for (const pair of discovery.analysis.allPairs.slice(0, 12)) {
    lines.push(
      `- ${pair.addressStatus} × ${pair.coordinatePrecision}: ${pair.count.toLocaleString()} (${pct(pair.pct)})`
    )
  }

  lines.push(
    '',
    '### Workstream B — Blocker classification',
    '#### Rules',
    discovery.classificationRulesSummary,
    '',
    '#### Categories'
  )
  for (const row of discovery.blockerCategories) {
    if (row.count <= 0) continue
    lines.push(
      `- ${CATEGORY_LABELS[row.category]}: ${row.count.toLocaleString()} (${pct(row.pct)})`
    )
  }
  lines.push(
    bullet(
      'smallest set ≥80%',
      discovery.explainingCategories.map((c) => CATEGORY_LABELS[c]).join(', ') || '—'
    ),
    bullet('explaining %', pct(discovery.explainingCategoriesPct))
  )

  lines.push('', '### Workstream C — Root cause ownership')
  for (const row of discovery.owners) {
    if (row.count <= 0) continue
    lines.push(
      `- ${OWNER_LABELS[row.owner]}: ${row.count.toLocaleString()} (${pct(row.pctNeedsCheck)} needs_check${
        row.pctRepairQueue != null ? `, ${pct(row.pctRepairQueue)} repair queue` : ''
      })`
    )
  }
  if (discovery.dominantCategory) {
    lines.push(
      bullet('dominant category', CATEGORY_LABELS[discovery.dominantCategory]),
      bullet('dominant owner', discovery.dominantOwner ? OWNER_LABELS[discovery.dominantOwner] : '—')
    )
  }

  lines.push('', '### Workstream D — Repair scope recommendation')
  lines.push(discovery.repairScopeRecommendation ?? '— (insufficient data)')

  return lines.join('\n')
}
