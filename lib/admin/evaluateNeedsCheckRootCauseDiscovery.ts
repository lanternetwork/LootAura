import {
  blockerCategoryToRepairOwner,
  NEEDS_CHECK_CLASSIFICATION_RULES_SUMMARY,
} from '@/lib/admin/classifyNeedsCheckBlocker'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  NEEDS_CHECK_AGE_BUCKETS,
  NEEDS_CHECK_BLOCKER_CATEGORIES,
  NEEDS_CHECK_REPAIR_OWNERS,
  type NeedsCheckAgeBucketRow,
  type NeedsCheckBlockerCategory,
  type NeedsCheckBlockerCategoryRow,
  type NeedsCheckFailureSignalRow,
  type NeedsCheckOwnerRow,
  type NeedsCheckPublishabilityRow,
  type NeedsCheckRepairOwner,
  type NeedsCheckRootCauseAnalysis,
  type NeedsCheckRootCauseDiscovery,
} from '@/lib/admin/needsCheckRootCauseTypes'

const AGE_BUCKET_LABELS: Record<(typeof NEEDS_CHECK_AGE_BUCKETS)[number], string> = {
  under_7d: '<7 days',
  '7_to_30d': '7–30 days',
  over_30d: '>30 days',
}

const OWNER_LABELS: Record<NeedsCheckRepairOwner, string> = {
  address_enrichment: 'Address enrichment',
  precision_handling: 'Precision handling',
  catalog_repair: 'Catalog repair',
  geocoding: 'Geocoding',
  other: 'Other',
}

const CATEGORY_LABELS: Record<NeedsCheckBlockerCategory, string> = {
  address_enrichment_retryable: 'Address enrichment retryable',
  address_enrichment_terminal: 'Address enrichment terminal',
  address_gated: 'Address gated (enrichment waiting)',
  precision_gated: 'Precision gated',
  geocode_blocked: 'Geocode blocked',
  publish_eligible_today: 'Publish eligible today',
  other: 'Other',
}

const PUBLISHABILITY_LABELS: Record<string, string> = {
  publishable_today: 'Publishable today',
  blocked_by_enrichment: 'Blocked by enrichment',
  blocked_by_precision: 'Blocked by precision',
  blocked_by_geocode: 'Blocked by geocode',
  blocked_by_other: 'Blocked by other factors',
}

function pct(count: number, total: number): number {
  return total > 0 ? count / total : 0
}

function sortedCategoryRows(
  analysis: NeedsCheckRootCauseAnalysis
): NeedsCheckBlockerCategoryRow[] {
  return NEEDS_CHECK_BLOCKER_CATEGORIES.map((category) => ({
    category,
    count: analysis.byBlockerCategory[category],
    pct: pct(analysis.byBlockerCategory[category], analysis.total),
  })).sort((a, b) => b.count - a.count)
}

function smallestExplainingSet(
  rows: NeedsCheckBlockerCategoryRow[],
  threshold = 0.8
): { categories: NeedsCheckBlockerCategory[]; pct: number } {
  let running = 0
  const categories: NeedsCheckBlockerCategory[] = []
  for (const row of rows) {
    if (row.count <= 0) continue
    categories.push(row.category)
    running += row.pct
    if (running >= threshold) break
  }
  return { categories, pct: running }
}

function aggregateOwners(
  analysis: NeedsCheckRootCauseAnalysis,
  repairQueue: number | null
): NeedsCheckOwnerRow[] {
  const ownerCounts = Object.fromEntries(
    NEEDS_CHECK_REPAIR_OWNERS.map((owner) => [owner, 0])
  ) as Record<NeedsCheckRepairOwner, number>

  for (const category of NEEDS_CHECK_BLOCKER_CATEGORIES) {
    const owner = blockerCategoryToRepairOwner(category)
    ownerCounts[owner] += analysis.byBlockerCategory[category]
  }

  return NEEDS_CHECK_REPAIR_OWNERS.map((owner) => ({
    owner,
    count: ownerCounts[owner],
    pctNeedsCheck: pct(ownerCounts[owner], analysis.total),
    pctRepairQueue:
      repairQueue != null && repairQueue > 0 ? ownerCounts[owner] / repairQueue : null,
  })).sort((a, b) => b.count - a.count)
}

function buildRepairScopeRecommendation(
  dominantCategory: NeedsCheckBlockerCategory | null,
  dominantOwner: NeedsCheckRepairOwner | null,
  analysis: NeedsCheckRootCauseAnalysis,
  explainingPct: number
): string | null {
  if (!dominantCategory || !dominantOwner || analysis.total === 0) {
    return null
  }

  const dominantCount = analysis.byBlockerCategory[dominantCategory]
  const dominantPct = pct(dominantCount, analysis.total)

  return [
    `Dominant bottleneck: ${CATEGORY_LABELS[dominantCategory]} (${dominantCount.toLocaleString()}, ${(dominantPct * 100).toFixed(1)}% of needs_check).`,
    `Primary owner: ${OWNER_LABELS[dominantOwner]}.`,
    `Smallest category set explaining ≥80%: ${(explainingPct * 100).toFixed(1)}% covered.`,
    'Next step: author implementation repair spec targeting the dominant owner only — no production gate changes until scoped.',
  ].join(' ')
}

/**
 * Workstreams B–D — pure evaluation from analysis + dashboard payloads.
 */
export function evaluateNeedsCheckRootCauseDiscovery(
  analysis: NeedsCheckRootCauseAnalysis,
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null,
  generatedAt: string
): NeedsCheckRootCauseDiscovery {
  const needsCheck = metrics.failureBreakdown.needs_check
  const repairQueue =
    coverage?.catalogRepair.repairQueueTotal ?? coverage?.pipelineBacklog.catalogRepairQueue ?? null
  const needsCheckPctOfRepairQueue =
    repairQueue != null && repairQueue > 0 ? needsCheck / repairQueue : null

  const blockerCategories = sortedCategoryRows(analysis)
  const explaining = smallestExplainingSet(blockerCategories)
  const dominantCategory =
    analysis.total > 0
      ? (blockerCategories.find((row) => row.count > 0)?.category ?? null)
      : null
  const dominantOwner = dominantCategory ? blockerCategoryToRepairOwner(dominantCategory) : null

  const ageBuckets: NeedsCheckAgeBucketRow[] = NEEDS_CHECK_AGE_BUCKETS.map((bucket) => ({
    bucket,
    label: AGE_BUCKET_LABELS[bucket],
    count: analysis.byAgeBucket[bucket],
    pct: pct(analysis.byAgeBucket[bucket], analysis.total),
  }))

  const publishability: NeedsCheckPublishabilityRow[] = Object.entries(analysis.byPublishability)
    .sort((a, b) => b[1] - a[1])
    .map(([profile, count]) => ({
      profile: PUBLISHABILITY_LABELS[profile] ?? profile,
      count,
      pct: pct(count, analysis.total),
    }))

  const failureSignals: NeedsCheckFailureSignalRow[] = Object.entries(analysis.failureSignals)
    .sort((a, b) => b[1] - a[1])
    .map(([signal, count]) => ({
      signal,
      count,
      pct: pct(count, analysis.total),
    }))

  const owners = aggregateOwners(analysis, repairQueue)

  const discoveryComplete =
    analysis.total > 0 &&
    analysis.scanned === analysis.total &&
    dominantCategory != null &&
    dominantOwner != null &&
    explaining.pct >= 0.8

  return {
    generatedAt,
    analysis,
    needsCheck,
    repairQueue,
    needsCheckPctOfRepairQueue,
    blockerCategories,
    ageBuckets,
    publishability,
    failureSignals,
    owners,
    dominantCategory,
    dominantOwner,
    explainingCategories: explaining.categories,
    explainingCategoriesPct: explaining.pct,
    discoveryComplete,
    repairScopeRecommendation: buildRepairScopeRecommendation(
      dominantCategory,
      dominantOwner,
      analysis,
      explaining.pct
    ),
    classificationRulesSummary: NEEDS_CHECK_CLASSIFICATION_RULES_SUMMARY,
  }
}

export { CATEGORY_LABELS, OWNER_LABELS }
