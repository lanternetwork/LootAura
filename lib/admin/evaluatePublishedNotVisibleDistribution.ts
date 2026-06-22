import {
  PUBLISHED_NOT_VISIBLE_BUCKETS,
  type PublishedNotVisibleBucket,
  type PublishedNotVisibleBucketRow,
  type PublishedNotVisibleClassifiedRow,
  type PublishedNotVisibleDistributionAnalysis,
  type PublishedNotVisibleDistributionDiscovery,
  type PublishedNotVisibleReconciliationRow,
  type PublishedNotVisibleVerdict,
} from '@/lib/admin/publishedNotVisibleDistributionTypes'

const SAMPLE_SIZE = 10
const VISIBILITY_FILTER_ZOMBIE_DISPOSITION_THRESHOLD = 0.95
const IMMATERIAL_VISIBLE_SALE_THRESHOLD = 0.01
const DOMINANT_STALE_SHARE_THRESHOLD = 0.5
const DOMINANT_MATCHING_SHARE_THRESHOLD = 0.5

function pct(count: number, total: number): number {
  return total > 0 ? count / total : 0
}

function bucketRows(analysis: PublishedNotVisibleDistributionAnalysis): PublishedNotVisibleBucketRow[] {
  return PUBLISHED_NOT_VISIBLE_BUCKETS.map((bucket) => ({
    bucket,
    count: analysis.byBucket[bucket],
    pct: pct(analysis.byBucket[bucket], analysis.cohortTotal),
  }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
}

function reconciliationRows(
  analysis: PublishedNotVisibleDistributionAnalysis
): PublishedNotVisibleReconciliationRow[] {
  return Object.entries(analysis.byReconciliationClass)
    .sort((a, b) => b[1] - a[1])
    .map(([reconciliationClass, count]) => ({
      reconciliationClass: reconciliationClass as PublishedNotVisibleReconciliationRow['reconciliationClass'],
      count,
      pct: pct(count, analysis.cohortTotal),
    }))
}

function dispositionCount(analysis: PublishedNotVisibleDistributionAnalysis): number {
  return (
    analysis.byBucket.ARCHIVED +
    analysis.byBucket.EXPIRED +
    analysis.byBucket.MODERATION_HIDDEN
  )
}

function matchingCount(analysis: PublishedNotVisibleDistributionAnalysis): number {
  return analysis.byBucket.MISMATCH + analysis.byBucket.NO_MATCHED_SALE
}

function staleCount(analysis: PublishedNotVisibleDistributionAnalysis): number {
  return analysis.byBucket.STALE_OBSERVATION
}

function selectSampleRows(
  rows: PublishedNotVisibleClassifiedRow[],
  dominantBucket: PublishedNotVisibleBucket | null
): PublishedNotVisibleClassifiedRow[] {
  if (rows.length === 0) return []

  const byBucket = new Map<PublishedNotVisibleBucket, PublishedNotVisibleClassifiedRow[]>()
  for (const row of rows) {
    const existing = byBucket.get(row.bucket) ?? []
    existing.push(row)
    byBucket.set(row.bucket, existing)
  }

  const samples: PublishedNotVisibleClassifiedRow[] = []
  const seen = new Set<string>()

  const push = (row: PublishedNotVisibleClassifiedRow) => {
    if (seen.has(row.canonicalUrl) || samples.length >= SAMPLE_SIZE) return
    seen.add(row.canonicalUrl)
    samples.push(row)
  }

  if (dominantBucket) {
    for (const row of byBucket.get(dominantBucket) ?? []) {
      push(row)
      if (samples.length >= Math.min(5, SAMPLE_SIZE)) break
    }
  }

  for (const bucket of PUBLISHED_NOT_VISIBLE_BUCKETS) {
    for (const row of byBucket.get(bucket) ?? []) {
      push(row)
      if (samples.length >= SAMPLE_SIZE) break
    }
    if (samples.length >= SAMPLE_SIZE) break
  }

  return samples
}

function secondaryAuditBugNote(analysis: PublishedNotVisibleDistributionAnalysis, total: number): string {
  const visibleSaleCount = analysis.byBucket.VISIBLE_SALE
  if (visibleSaleCount <= 0) return ''
  const visibleSalePct = pct(visibleSaleCount, total)
  if (visibleSalePct > IMMATERIAL_VISIBLE_SALE_THRESHOLD) return ''
  return (
    ` Secondary audit signal: ${visibleSaleCount} row(s) with Phase-4-visible linked sales ` +
    `(COVERAGE_VISIBILITY_AUDIT_BUG_V1).`
  )
}

function deriveVerdict(analysis: PublishedNotVisibleDistributionAnalysis): {
  verdict: PublishedNotVisibleVerdict
  rationale: string
} {
  const total = analysis.cohortTotal
  if (total <= 0) {
    return {
      verdict: 'OTHER',
      rationale: 'Empty cohort — no published_not_visible rows at audit time.',
    }
  }

  const visibleSaleCount = analysis.byBucket.VISIBLE_SALE
  const visibleSalePct = pct(visibleSaleCount, total)
  const visibilityFilterZombiePct = pct(analysis.visibilityFilterZombieCount, total)
  const auditBugNote = secondaryAuditBugNote(analysis, total)

  if (
    visibilityFilterZombiePct >= VISIBILITY_FILTER_ZOMBIE_DISPOSITION_THRESHOLD &&
    visibleSalePct <= IMMATERIAL_VISIBLE_SALE_THRESHOLD
  ) {
    const disposition = dispositionCount(analysis)
    const dispositionPct = pct(disposition, total)
    return {
      verdict: 'PUBLISHED_NOT_VISIBLE_DISPOSITION_REPAIR_V1',
      rationale:
        `visibility_filter_zombie=${analysis.visibilityFilterZombieCount}/${total} ` +
        `(${(visibilityFilterZombiePct * 100).toFixed(1)}%). ` +
        `Disposition buckets (ARCHIVED+EXPIRED+MODERATION_HIDDEN)=${disposition}/${total} ` +
        `(${(dispositionPct * 100).toFixed(1)}%).` +
        auditBugNote,
    }
  }

  if (visibleSaleCount > 0 && visibleSalePct > IMMATERIAL_VISIBLE_SALE_THRESHOLD) {
    return {
      verdict: 'COVERAGE_VISIBILITY_AUDIT_BUG_V1',
      rationale: `${visibleSaleCount} row(s) (${(visibleSalePct * 100).toFixed(1)}%) have linked sales passing Phase 4 visibility while observations remain lootaura_visible=false.`,
    }
  }

  const disposition = dispositionCount(analysis)
  const stale = staleCount(analysis)
  const matching = matchingCount(analysis)
  const publishHook = analysis.publishHookCount

  const dispositionPct = pct(disposition, total)
  const matchingPct = pct(matching, total)
  const publishHookPct = pct(publishHook, total)
  const staleSignalPct = pct(stale + publishHook, total)

  if (staleSignalPct >= DOMINANT_STALE_SHARE_THRESHOLD) {
    return {
      verdict: 'PUBLISHED_NOT_VISIBLE_RECONCILIATION_REPAIR_V1',
      rationale:
        `Stale/reconciliation signals account for ${stale + publishHook} / ${total} ` +
        `(${(staleSignalPct * 100).toFixed(1)}%); STALE_OBSERVATION=${stale}, publish_hook=${publishHook} ` +
        `(${(publishHookPct * 100).toFixed(1)}%).` +
        auditBugNote,
    }
  }

  if (matchingPct >= DOMINANT_MATCHING_SHARE_THRESHOLD) {
    return {
      verdict: 'PUBLISHED_NOT_VISIBLE_MATCHING_REPAIR_V1',
      rationale:
        `Matching buckets (MISMATCH+NO_MATCHED_SALE) account for ${matching} / ${total} ` +
        `(${(matchingPct * 100).toFixed(1)}%).` +
        auditBugNote,
    }
  }

  if (dispositionPct > 0) {
    return {
      verdict: 'PUBLISHED_NOT_VISIBLE_DISPOSITION_REPAIR_V1',
      rationale:
        `Disposition buckets (ARCHIVED+EXPIRED+MODERATION_HIDDEN) account for ${disposition} / ${total} ` +
        `(${(dispositionPct * 100).toFixed(1)}%). visibility_filter_zombie=${analysis.visibilityFilterZombieCount}.` +
        auditBugNote,
    }
  }

  if (visibleSaleCount > 0) {
    return {
      verdict: 'COVERAGE_VISIBILITY_AUDIT_BUG_V1',
      rationale: `${visibleSaleCount} row(s) have linked sales passing Phase 4 visibility while observations remain lootaura_visible=false.`,
    }
  }

  return {
    verdict: 'OTHER',
    rationale: 'No dominant pattern among disposition, stale, or matching buckets.',
  }
}

/**
 * Sections F/G — pure evaluation from read-only analysis aggregates.
 */
export function evaluatePublishedNotVisibleDistribution(
  analysis: PublishedNotVisibleDistributionAnalysis,
  classifiedRows: PublishedNotVisibleClassifiedRow[] = []
): PublishedNotVisibleDistributionDiscovery {
  const rows = bucketRows(analysis)
  const dominantBucket = rows[0]?.bucket ?? null
  const dominantBucketPct = rows[0]?.pct ?? 0
  const total = analysis.cohortTotal

  const { verdict, rationale } = deriveVerdict(analysis)

  return {
    generatedAt: analysis.generatedAt,
    analysis,
    bucketRows: rows,
    reconciliationRows: reconciliationRows(analysis),
    dominantBucket,
    dominantBucketPct,
    dispositionSharePct: pct(dispositionCount(analysis), total),
    staleSharePct: pct(staleCount(analysis), total),
    matchingSharePct: pct(matchingCount(analysis), total),
    publishHookSharePct: pct(analysis.publishHookCount, total),
    verdict,
    verdictRationale: rationale,
    sampleRows: selectSampleRows(classifiedRows, dominantBucket),
    auditComplete: total > 0 && dominantBucket != null,
  }
}
