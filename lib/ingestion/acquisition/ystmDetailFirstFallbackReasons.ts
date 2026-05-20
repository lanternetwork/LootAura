/**
 * Phase 3B detail-first fallback reason codes (metrics / dashboard only).
 */

export type YstmDetailFirstFallbackReason =
  | 'fallback_unclassified'
  | 'fetch_failed'
  | 'parse_no_listing'
  | 'expired_after_detail'
  | 'invalid_dates'
  | 'missing_title'
  | 'address_validation_failed'
  | 'missing_street_number'
  | 'gated_address'
  | 'native_coords_invalid'
  | 'spatial_lookup_failed'
  | 'insert_failed'
  | 'canonical_collision'
  | 'publish_failed'

/** Counted on metrics but not a legacy fallback (excluded from fallback reconciliation). */
export const YSTM_DETAIL_FIRST_NON_FALLBACK_REJECTED_REASONS: ReadonlySet<YstmDetailFirstFallbackReason> =
  new Set(['publish_failed'])

export const YSTM_DETAIL_FIRST_FALLBACK_REASON_ORDER: YstmDetailFirstFallbackReason[] = [
  'fallback_unclassified',
  'spatial_lookup_failed',
  'native_coords_invalid',
  'address_validation_failed',
  'missing_street_number',
  'expired_after_detail',
  'invalid_dates',
  'gated_address',
  'fetch_failed',
  'parse_no_listing',
  'insert_failed',
  'canonical_collision',
  'missing_title',
  'publish_failed',
]

export type DetailFirstFallbackReasonCounts = Partial<
  Record<YstmDetailFirstFallbackReason, number>
>

export function emptyDetailFirstFallbackReasonCounts(): DetailFirstFallbackReasonCounts {
  return {}
}

export function mergeDetailFirstFallbackReasonCounts(
  target: DetailFirstFallbackReasonCounts,
  delta: DetailFirstFallbackReasonCounts | Record<string, number> | undefined
): void {
  if (!delta) return
  for (const [reason, count] of Object.entries(delta)) {
    if (!count || count <= 0) continue
    const key = reason as YstmDetailFirstFallbackReason
    target[key] = (target[key] ?? 0) + count
  }
}

export function isDetailFirstFallbackRejectedReason(
  reason: string
): reason is YstmDetailFirstFallbackReason {
  return (
    YSTM_DETAIL_FIRST_FALLBACK_REASON_ORDER.includes(reason as YstmDetailFirstFallbackReason) &&
    !YSTM_DETAIL_FIRST_NON_FALLBACK_REJECTED_REASONS.has(reason as YstmDetailFirstFallbackReason)
  )
}

export function sumDetailFirstFallbackReasonCounts(
  counts: DetailFirstFallbackReasonCounts | Record<string, number> | undefined
): number {
  if (!counts) return 0
  let total = 0
  for (const [reason, count] of Object.entries(counts)) {
    if (!count || count <= 0) continue
    if (!isDetailFirstFallbackRejectedReason(reason)) continue
    total += count
  }
  return total
}

/**
 * Ensure every fallback has a reason bucket (adds `fallback_unclassified` for any gap).
 */
export function reconcileDetailFirstFallbackReasonCounts(
  target: DetailFirstFallbackReasonCounts | Record<string, number>,
  fallbackCount: number
): void {
  if (fallbackCount <= 0) return
  const sum = sumDetailFirstFallbackReasonCounts(target)
  const gap = fallbackCount - sum
  if (gap > 0) {
    target.fallback_unclassified = (target.fallback_unclassified ?? 0) + gap
  }
}

export type DetailFirstFallbackReasonSummary = {
  fallbackByReason: Record<string, number>
  topFallbackReason: string | null
  topFallbackReasonCount: number
  topFallbackReasonPct: number | null
  fallbackReasonAccounted: number
}

/** Summarize fallback counts; percentages are share of `attempted`. */
export function summarizeDetailFirstFallbackReasons(
  rejectedByReason: DetailFirstFallbackReasonCounts | Record<string, number> | undefined,
  attempted: number,
  fallbackCount?: number
): DetailFirstFallbackReasonSummary {
  const fallbackByReason: Record<string, number> = {}
  mergeDetailFirstFallbackReasonCounts(fallbackByReason, rejectedByReason)
  if (fallbackCount != null && fallbackCount > 0) {
    reconcileDetailFirstFallbackReasonCounts(fallbackByReason, fallbackCount)
  }

  let topFallbackReason: string | null = null
  let topFallbackReasonCount = 0
  for (const [reason, count] of Object.entries(fallbackByReason)) {
    if (count > topFallbackReasonCount) {
      topFallbackReason = reason
      topFallbackReasonCount = count
    }
  }

  const topFallbackReasonPct =
    attempted > 0 && topFallbackReason != null
      ? Math.round((topFallbackReasonCount / attempted) * 10000) / 10000
      : null

  return {
    fallbackByReason,
    topFallbackReason,
    topFallbackReasonCount,
    topFallbackReasonPct,
    fallbackReasonAccounted: sumDetailFirstFallbackReasonCounts(fallbackByReason),
  }
}
