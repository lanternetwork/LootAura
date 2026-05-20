import { DETAIL_FIRST_SUCCESS_RATE_TARGET } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

export type DetailFirstCaptureInput = {
  crawlerDiscovered: number
  duplicateSkipped: number
  freshInserted: number
  detailFirstAttempted: number
  detailFirstReady: number
  detailFirstPublished: number
}

export type DetailFirstCaptureMetrics = {
  crawlerDiscovered: number
  duplicateSkipped: number
  freshInserted: number
  detailFirstAttempted: number
  detailFirstReady: number
  detailFirstPublished: number
  /** Detail-first ready / attempted (parser SLO). */
  parserSuccessRate: number | null
  /** Fresh inserts / crawler discovered (visible capture). */
  visibleCaptureRate: number | null
  /** Published same run / crawler discovered. */
  visiblePublishRate: number | null
  /**
   * Parser success minus visible capture when both rates exist.
   * Large positive gap => parser SLO met but dedupe/saturation limits new rows.
   */
  parserToVisibleGapRate: number | null
  /** True when parser meets ≥90% target but visible capture is below 1%. */
  parserSloMetVisibleCaptureLow: boolean
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 10000) / 10000
}

export function buildDetailFirstCaptureMetrics(
  input: DetailFirstCaptureInput
): DetailFirstCaptureMetrics {
  const parserSuccessRate = rate(input.detailFirstReady, input.detailFirstAttempted)
  const visibleCaptureRate = rate(input.freshInserted, input.crawlerDiscovered)
  const visiblePublishRate = rate(input.detailFirstPublished, input.crawlerDiscovered)
  const parserToVisibleGapRate =
    parserSuccessRate != null && visibleCaptureRate != null
      ? Math.round((parserSuccessRate - visibleCaptureRate) * 10000) / 10000
      : null

  const parserSloMetVisibleCaptureLow =
    parserSuccessRate != null &&
    parserSuccessRate >= DETAIL_FIRST_SUCCESS_RATE_TARGET &&
    visibleCaptureRate != null &&
    visibleCaptureRate < 0.01

  return {
    crawlerDiscovered: input.crawlerDiscovered,
    duplicateSkipped: input.duplicateSkipped,
    freshInserted: input.freshInserted,
    detailFirstAttempted: input.detailFirstAttempted,
    detailFirstReady: input.detailFirstReady,
    detailFirstPublished: input.detailFirstPublished,
    parserSuccessRate,
    visibleCaptureRate,
    visiblePublishRate,
    parserToVisibleGapRate,
    parserSloMetVisibleCaptureLow,
  }
}
