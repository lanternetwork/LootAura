import type { ListFastFailureDistributionDiscovery } from '@/lib/admin/listFastFailureDistributionTypes'

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? value.toLocaleString('en-US') : value}`
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Markdown export for LIST_FAST_FAILURE_DISTRIBUTION_V1 (Sections A–G).
 */
export function buildListFastFailureDistributionDiagnostics(
  discovery: ListFastFailureDistributionDiscovery
): string {
  const { analysis } = discovery
  const lines: string[] = [
    '## LIST_FAST_FAILURE_DISTRIBUTION_V1',
    bullet('generated at', discovery.generatedAt),
    bullet('audit complete', discovery.auditComplete ? 'yes' : 'no'),
    '',
    '### Section A — Cohort',
    bullet('total_failed_hot_24h', analysis.totalFailedHot24h),
    bullet('total_failed_hot_warm_24h (panel reconcile)', analysis.totalFailedHotWarm24h),
    bullet('total_ingested_hot_24h (publish gap)', analysis.totalIngestedHot24h),
    bullet('hot_queue_depth', analysis.hotQueueDepth),
    bullet('oldest_failed_age_hours', analysis.oldestFailedAgeHours?.toFixed(2) ?? '—'),
    bullet('newest_failed_age_hours', analysis.newestFailedAgeHours?.toFixed(2) ?? '—'),
    bullet('cohort window hours', analysis.cohortWindowHours),
    '',
    discovery.reconciliationNote,
    '',
    '### Section B — Failure reason distribution',
  ]

  for (const row of discovery.failureReasonRows) {
    lines.push(`- ${row.reason}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
  }
  if (discovery.dominantFailureReason) {
    lines.push(
      bullet(
        'dominant reason',
        `${discovery.dominantFailureReason} (${pct(discovery.dominantFailureReasonPct)}${
          discovery.dominantFailureReasonOver70 ? ', >70%' : ''
        })`
      )
    )
  }

  lines.push('', '### Section C — Snapshot completeness')
  for (const row of discovery.snapshotCompletenessRows) {
    lines.push(`- ${row.bucket}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
  }

  lines.push('', '### Section D — Publish suppression signals')
  if (discovery.publishSuppressionRows.length === 0) {
    lines.push('- (none detected in failed cohort joins)')
  } else {
    for (const row of discovery.publishSuppressionRows) {
      lines.push(`- ${row.signal}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
    }
  }

  lines.push('', '### Section E — Geocode impact')
  for (const row of discovery.geocodeImpactRows) {
    lines.push(`- ${row.bucket}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
  }

  lines.push(
    '',
    '### Section F — Classification',
    bullet('F1 (failed cohort)', discovery.f1Classification),
    bullet('F2 (ingested supplemental)', discovery.f2Classification)
  )

  if (Object.keys(analysis.ingestedByStatus).length > 0) {
    lines.push('', '#### Supplemental ingested status')
    for (const [status, count] of Object.entries(analysis.ingestedByStatus).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${status}: ${count.toLocaleString()}`)
    }
  }

  lines.push(
    '',
    '### Section G — Recommendation',
    discovery.recommendedRepairSpec ?? '— (insufficient dominant signal; triage mixed failures)',
    '',
    '_No repairs implemented in this audit PR._'
  )

  return lines.join('\n')
}
