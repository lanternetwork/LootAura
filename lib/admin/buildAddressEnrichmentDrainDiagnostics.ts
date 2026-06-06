import type { AddressEnrichmentDrainCohortAnalysis } from '@/lib/ingestion/address/addressEnrichmentDrainTypes'
import {
  ADDRESS_ENRICHMENT_FAILURE_SUBTYPES,
  ADDRESS_ENRICHMENT_PENDING_COHORT_CLASSIFICATIONS,
} from '@/lib/ingestion/address/addressEnrichmentDrainTypes'

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? value.toLocaleString('en-US') : value}`
}

function pct(count: number, total: number): string {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0.0%'
}

export function buildAddressEnrichmentDrainDiagnostics(
  analysis: AddressEnrichmentDrainCohortAnalysis
): string {
  const lines: string[] = [
    '## ADDRESS_ENRICHMENT_DRAIN_REPAIR',
    bullet('cohort', analysis.cohortKey),
    bullet('rows scanned', analysis.scanned),
    bullet('dominant failure subtype', analysis.dominantFailureSubtype ?? '—'),
    '',
    '### Workstream A — Cohort classification',
  ]

  for (const key of ADDRESS_ENRICHMENT_PENDING_COHORT_CLASSIFICATIONS) {
    const count = analysis.byClassification[key]
    if (count <= 0 && key !== 'unclassified') continue
    lines.push(`- ${key}: ${count.toLocaleString()} (${pct(count, analysis.total)})`)
  }

  lines.push('', '### Workstream B — Failure subtypes')
  for (const key of ADDRESS_ENRICHMENT_FAILURE_SUBTYPES) {
    const count = analysis.byFailureSubtype[key]
    if (count <= 0) continue
    lines.push(`- ${key}: ${count.toLocaleString()} (${pct(count, analysis.total)})`)
  }

  return lines.join('\n')
}
