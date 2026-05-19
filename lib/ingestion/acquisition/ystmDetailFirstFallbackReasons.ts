/**
 * Phase 3B detail-first fallback reason codes (metrics / dashboard only).
 */

export type YstmDetailFirstFallbackReason =
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

export const YSTM_DETAIL_FIRST_FALLBACK_REASON_ORDER: YstmDetailFirstFallbackReason[] = [
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

export type DetailFirstFallbackReasonSummary = {
  fallbackByReason: Record<string, number>
  topFallbackReason: string | null
  topFallbackReasonCount: number
  topFallbackReasonPct: number | null
}

/** Summarize fallback counts; percentages are share of `attempted`. */
export function summarizeDetailFirstFallbackReasons(
  rejectedByReason: DetailFirstFallbackReasonCounts | Record<string, number> | undefined,
  attempted: number
): DetailFirstFallbackReasonSummary {
  const fallbackByReason: Record<string, number> = {}
  mergeDetailFirstFallbackReasonCounts(fallbackByReason, rejectedByReason)

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
  }
}
