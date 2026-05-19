import type { YstmDetailFirstRunMetrics } from '@/lib/ingestion/acquisition/ystmDetailFirstReady'
import { summarizeDetailFirstFallbackReasons } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'

export type DetailFirstOrchestrationFields = {
  ystmDetailFirstAttempted: number
  ystmDetailFirstSucceeded: number
  ystmDetailFirstPublished: number
  ystmDetailFirstFallback: number
  ystmDetailFirstFetchFailed: number
  freshInsertReadyAtInsertRate: number | null
  medianMsToPublished: number | null
  ystmDetailFirstFallbackByReason: Record<string, number>
  ystmDetailFirstTopFallbackReason: string | null
  ystmDetailFirstTopFallbackReasonPct: number | null
}

export function detailFirstOrchestrationFields(
  metrics: YstmDetailFirstRunMetrics,
  freshInserted: number
): DetailFirstOrchestrationFields {
  const attempted = metrics.attempted
  const succeeded = metrics.succeeded
  const freshInsertReadyAtInsertRate =
    freshInserted > 0 ? Math.round((succeeded / freshInserted) * 10000) / 10000 : null

  let medianMsToPublished: number | null = null
  const samples = metrics.msToPublishedSamples
  if (samples.length > 0) {
    const sorted = [...samples].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    medianMsToPublished =
      sorted.length % 2 === 1
        ? sorted[mid]!
        : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
  }

  const fallbackSummary = summarizeDetailFirstFallbackReasons(
    metrics.rejectedByReason,
    attempted,
    metrics.fallback
  )

  return {
    ystmDetailFirstAttempted: attempted,
    ystmDetailFirstSucceeded: succeeded,
    ystmDetailFirstPublished: metrics.published,
    ystmDetailFirstFallback: metrics.fallback,
    ystmDetailFirstFetchFailed: metrics.fetchFailed,
    freshInsertReadyAtInsertRate,
    medianMsToPublished,
    ystmDetailFirstFallbackByReason: fallbackSummary.fallbackByReason,
    ystmDetailFirstTopFallbackReason: fallbackSummary.topFallbackReason,
    ystmDetailFirstTopFallbackReasonPct: fallbackSummary.topFallbackReasonPct,
  }
}
