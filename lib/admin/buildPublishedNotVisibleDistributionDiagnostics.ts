import type { PublishedNotVisibleDistributionDiscovery } from '@/lib/admin/publishedNotVisibleDistributionTypes'

function bullet(label: string, value: string | number | boolean): string {
  let rendered: string
  if (typeof value === 'number') {
    rendered = value.toLocaleString('en-US')
  } else if (typeof value === 'boolean') {
    rendered = value ? 'yes' : 'no'
  } else {
    rendered = value
  }
  return `- ${label}: ${rendered}`
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function truncateUrl(url: string, max = 72): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 1)}…`
}

/**
 * Markdown export for PUBLISHED_NOT_VISIBLE_DISTRIBUTION_V2 (Sections A–G).
 */
export function buildPublishedNotVisibleDistributionDiagnostics(
  discovery: PublishedNotVisibleDistributionDiscovery
): string {
  const { analysis } = discovery
  const lines: string[] = [
    '## PUBLISHED_NOT_VISIBLE_DISTRIBUTION_V2',
    bullet('generated at', discovery.generatedAt),
    bullet('audit complete', discovery.auditComplete ? 'yes' : 'no'),
    '',
    '### Section A — Cohort Summary',
    bullet('cohort_total', analysis.cohortTotal),
    bullet('visibility_filter_zombie', analysis.visibilityFilterZombieCount),
    bullet('observation_stale_tag', analysis.observationStaleTagCount),
    bullet('publish_hook', analysis.publishHookCount),
    '',
    '### Section B — Distribution Table',
  ]

  if (discovery.bucketRows.length === 0) {
    lines.push('- (empty cohort)')
  } else {
    for (const row of discovery.bucketRows) {
      lines.push(`- ${row.bucket}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
    }
    lines.push(
      bullet('total', analysis.cohortTotal),
      bullet(
        'dominant bucket',
        discovery.dominantBucket
          ? `${discovery.dominantBucket} (${pct(discovery.dominantBucketPct)})`
          : '—'
      )
    )
  }

  lines.push(
    '',
    '### Section C — Visibility Breakdown',
    bullet('disposition share (ARCHIVED+EXPIRED+MODERATION_HIDDEN)', pct(discovery.dispositionSharePct)),
    bullet('stale_observation share', pct(discovery.staleSharePct)),
    bullet('matching share (MISMATCH+NO_MATCHED_SALE)', pct(discovery.matchingSharePct)),
    bullet('publish_hook share', pct(discovery.publishHookSharePct)),
    bullet('visible_sale (audit bug signal)', analysis.byBucket.VISIBLE_SALE),
    '',
    '### Section D — Sample Rows'
  )

  if (discovery.sampleRows.length === 0) {
    lines.push('- (none)')
  } else {
    for (const row of discovery.sampleRows) {
      lines.push(
        `- ${truncateUrl(row.canonicalUrl)} | bucket=${row.bucket} | reconciliation=${row.reconciliationClass} | phase4=${row.passesPhase4PublicVisibility ? 'pass' : 'fail'} | sale=${row.saleId ?? '—'} | published_sale_id=${row.ingestedPublishedSaleId ?? '—'} | matched_sale_id=${row.matchedSaleId ?? '—'} | appearance=${row.appearanceSource ?? '—'} | tags=${row.secondaryTags.join(',') || '—'}`
      )
    }
  }

  lines.push('', '### Section E — Reconciliation Crosswalk')
  if (discovery.reconciliationRows.length === 0) {
    lines.push('- (none)')
  } else {
    for (const row of discovery.reconciliationRows) {
      lines.push(`- ${row.reconciliationClass}: ${row.count.toLocaleString()} (${pct(row.pct)})`)
    }
  }

  lines.push(
    '',
    '### Section F — Dominant Patterns',
    bullet('dominant bucket', discovery.dominantBucket ?? '—'),
    bullet('disposition share', pct(discovery.dispositionSharePct)),
    bullet('stale share', pct(discovery.staleSharePct)),
    bullet('matching share', pct(discovery.matchingSharePct)),
    '',
    '### Section G — Verdict',
    discovery.verdict,
    discovery.verdictRationale,
    '',
    '_No repairs implemented in this audit PR._'
  )

  return lines.join('\n')
}
