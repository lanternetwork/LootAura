import {
  LIST_FAST_GEOCODE_IMPACT_BUCKETS,
  LIST_FAST_PUBLISH_SUPPRESSION_SIGNALS,
  LIST_FAST_SNAPSHOT_COMPLETENESS_BUCKETS,
  type ListFastFailureDistributionAnalysis,
  type ListFastFailureDistributionDiscovery,
  type ListFastFailureReasonRow,
  type ListFastF1Classification,
  type ListFastF2Classification,
  type ListFastGeocodeImpactRow,
  type ListFastPublishSuppressionRow,
  type ListFastSnapshotCompletenessRow,
} from '@/lib/admin/listFastFailureDistributionTypes'

const DOMINANT_THRESHOLD = 0.7

function pct(count: number, total: number): number {
  return total > 0 ? count / total : 0
}

function sortedReasonRows(analysis: ListFastFailureDistributionAnalysis): ListFastFailureReasonRow[] {
  return Object.entries(analysis.byFailureReason)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      count,
      pct: pct(count, analysis.totalFailedHot24h),
    }))
}

function snapshotRows(analysis: ListFastFailureDistributionAnalysis): ListFastSnapshotCompletenessRow[] {
  return LIST_FAST_SNAPSHOT_COMPLETENESS_BUCKETS.map((bucket) => ({
    bucket,
    count: analysis.bySnapshotCompleteness[bucket],
    pct: pct(analysis.bySnapshotCompleteness[bucket], analysis.totalFailedHot24h),
  })).filter((row) => row.count > 0)
}

function suppressionRows(analysis: ListFastFailureDistributionAnalysis): ListFastPublishSuppressionRow[] {
  return LIST_FAST_PUBLISH_SUPPRESSION_SIGNALS.map((signal) => ({
    signal,
    count: analysis.byPublishSuppression[signal],
    pct: pct(analysis.byPublishSuppression[signal], analysis.totalFailedHot24h),
  })).filter((row) => row.count > 0)
}

function geocodeRows(analysis: ListFastFailureDistributionAnalysis): ListFastGeocodeImpactRow[] {
  return LIST_FAST_GEOCODE_IMPACT_BUCKETS.map((bucket) => ({
    bucket,
    count: analysis.byGeocodeImpact[bucket],
    pct: pct(analysis.byGeocodeImpact[bucket], analysis.totalFailedHot24h),
  })).filter((row) => row.count > 0)
}

function classifyF1(
  dominantReason: string | null,
  dominantPct: number,
  totalFailed: number
): ListFastF1Classification {
  if (totalFailed <= 0) return 'INSUFFICIENT_DATA'
  if (dominantPct < DOMINANT_THRESHOLD) return 'MIXED_FAILURES'

  if (dominantReason === 'geocode_unavailable') return 'GEOCODE_BLOCKED'
  if (
    dominantReason === 'gated_only' ||
    dominantReason === 'missing_dates' ||
    dominantReason === 'missing_title' ||
    dominantReason === 'expired' ||
    dominantReason === 'unparseable_detail'
  ) {
    return 'SNAPSHOT_VALIDITY_DOMINANT'
  }
  if (dominantReason === 'insert_failed') return 'INSERT_FAILURE_DOMINANT'
  return 'MIXED_FAILURES'
}

function classifyF2(analysis: ListFastFailureDistributionAnalysis): ListFastF2Classification {
  const ingestedTotal = analysis.totalIngestedHot24h
  if (ingestedTotal <= 0) return 'NO_INGESTED_COHORT'

  if (analysis.ingestedNeedsGeocodeCount / ingestedTotal >= DOMINANT_THRESHOLD) {
    return 'INGESTED_NEEDS_GEOCODE'
  }
  const needsCheck = analysis.ingestedByStatus.needs_check ?? 0
  if (needsCheck / ingestedTotal >= DOMINANT_THRESHOLD) {
    return 'INGESTED_NEEDS_CHECK'
  }
  if (ingestedTotal >= analysis.totalFailedHot24h && analysis.totalFailedHot24h > 0) {
    return 'PUBLISH_GAP_DOMINANT'
  }
  return 'INGESTED_OTHER'
}

function repairSpecForF1(f1: ListFastF1Classification, dominantReason: string | null): string | null {
  switch (f1) {
    case 'GEOCODE_BLOCKED':
      return 'LIST_FAST_GEOCODE_UNAVAILABLE_REPAIR_V1'
    case 'SNAPSHOT_VALIDITY_DOMINANT':
      return 'LIST_FAST_METADATA_VALIDITY_REPAIR_V1'
    case 'INSERT_FAILURE_DOMINANT':
      return 'LIST_FAST_INSERT_FAILURE_REPAIR_V1'
    case 'MIXED_FAILURES':
      return dominantReason ? `LIST_FAST_MIXED_TRIAGE_${dominantReason.toUpperCase()}_V1` : null
    default:
      return null
  }
}

function repairSpecForF2(f2: ListFastF2Classification): string | null {
  switch (f2) {
    case 'PUBLISH_GAP_DOMINANT':
      return 'LIST_FAST_PUBLISH_GAP_REPAIR_V1'
    case 'INGESTED_NEEDS_GEOCODE':
      return 'LIST_FAST_INGESTED_GEOCODE_REPAIR_V1'
    case 'INGESTED_NEEDS_CHECK':
      return 'LIST_FAST_INGESTED_NEEDS_CHECK_REPAIR_V1'
    default:
      return null
  }
}

function buildRecommendation(
  analysis: ListFastFailureDistributionAnalysis,
  f1: ListFastF1Classification,
  f2: ListFastF2Classification,
  dominantReason: string | null,
  dominantOver70: boolean
): string | null {
  if (analysis.totalFailedHot24h <= 0 && analysis.totalIngestedHot24h <= 0) {
    return null
  }

  const f2Spec = repairSpecForF2(f2)
  if (
    f2Spec &&
    analysis.totalIngestedHot24h > 0 &&
    analysis.totalIngestedHot24h >= analysis.totalFailedHot24h
  ) {
    return f2Spec
  }

  if (dominantOver70) {
    return repairSpecForF1(f1, dominantReason)
  }

  if (analysis.totalIngestedHot24h > analysis.totalFailedHot24h / 2 && analysis.totalIngestedHot24h > 0) {
    return 'Run publish-path triage on supplemental ingested cohort before list-fast metadata/geocode repairs.'
  }

  return 'Mixed failures — triage top 2 reasons before authoring a scoped repair spec.'
}

/**
 * Sections F/G — pure evaluation from read-only analysis aggregates.
 */
export function evaluateListFastFailureDistribution(
  analysis: ListFastFailureDistributionAnalysis
): ListFastFailureDistributionDiscovery {
  const failureReasonRows = sortedReasonRows(analysis)
  const dominantFailureReason = failureReasonRows[0]?.reason ?? null
  const dominantFailureReasonPct = failureReasonRows[0]?.pct ?? 0
  const dominantFailureReasonOver70 = dominantFailureReasonPct >= DOMINANT_THRESHOLD

  const f1Classification = classifyF1(
    dominantFailureReason,
    dominantFailureReasonPct,
    analysis.totalFailedHot24h
  )
  const f2Classification = classifyF2(analysis)

  const recommendedRepairSpec = buildRecommendation(
    analysis,
    f1Classification,
    f2Classification,
    dominantFailureReason,
    dominantFailureReasonOver70
  )

  const auditComplete =
    analysis.totalFailedHot24h > 0 &&
    dominantFailureReason != null &&
    (dominantFailureReasonOver70 || analysis.totalIngestedHot24h > 0)

  const reconciliationNote =
    `Diagnostics panel counts hot+warm failed 24h (${analysis.totalFailedHotWarm24h}); ` +
    `this audit failed cohort is hot-only with snapshot (${analysis.totalFailedHot24h}). ` +
    `Supplemental ingested hot cohort: ${analysis.totalIngestedHot24h}.`

  return {
    generatedAt: analysis.generatedAt,
    analysis,
    failureReasonRows,
    dominantFailureReason,
    dominantFailureReasonPct,
    dominantFailureReasonOver70,
    snapshotCompletenessRows: snapshotRows(analysis),
    publishSuppressionRows: suppressionRows(analysis),
    geocodeImpactRows: geocodeRows(analysis),
    f1Classification,
    f2Classification,
    recommendedRepairSpec,
    auditComplete,
    reconciliationNote,
  }
}
