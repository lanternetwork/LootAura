import {
  windowExpiredDiscoveryRatio,
  windowFreshInsertYield,
  windowSkipRatio,
  type ConfigCrawlStatsSnapshot,
} from '@/lib/ingestion/acquisition/configCrawlStats'
import { computeRate } from '@/lib/admin/ingestionVolumeMetricsHelpers'

export type ConfigYieldLeaderboardEntry = {
  city: string
  state: string
  windowFetched: number
  windowSkippedExpired: number
  windowFreshInserted: number
  windowDupSkips: number
  freshInsertYield: number | null
  expiredDiscoveryRatio: number | null
  skipRatio: number | null
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
}

export function buildConfigYieldLeaderboards(
  rows: ConfigCrawlStatsSnapshot[],
  nowMs: number,
  limit = 8
): {
  topFreshYield: ConfigYieldLeaderboardEntry[]
  topStale: ConfigYieldLeaderboardEntry[]
  topDuplicate: ConfigYieldLeaderboardEntry[]
} {
  const entries: ConfigYieldLeaderboardEntry[] = rows.map((row) => {
    const windowFetched = num(row.source_crawl_window_fetched)
    const windowSkippedExpired = num(row.source_crawl_window_skipped_expired)
    const windowFreshInserted = num(row.source_crawl_window_fresh_inserted)
    const windowDupSkips =
      num(row.source_crawl_window_dup_existing_url) +
      num(row.source_crawl_window_dup_cross_page) +
      num(row.source_crawl_window_dup_canonical) +
      num(row.source_crawl_window_dup_expired_row)

    return {
      city: row.city,
      state: row.state,
      windowFetched,
      windowSkippedExpired,
      windowFreshInserted,
      windowDupSkips,
      freshInsertYield: windowFreshInsertYield(row),
      expiredDiscoveryRatio: windowExpiredDiscoveryRatio(row),
      skipRatio: windowSkipRatio(row),
    }
  })

  const withActivity = entries.filter((e) => e.windowFetched >= 5)

  const topFreshYield = [...withActivity]
    .filter((e) => e.windowFreshInserted > 0)
    .sort((a, b) => (b.freshInsertYield ?? 0) - (a.freshInsertYield ?? 0))
    .slice(0, limit)

  const topStale = [...withActivity]
    .sort((a, b) => {
      const ae = a.expiredDiscoveryRatio ?? 0
      const be = b.expiredDiscoveryRatio ?? 0
      if (be !== ae) return be - ae
      return b.windowSkippedExpired - a.windowSkippedExpired
    })
    .slice(0, limit)

  const topDuplicate = [...withActivity]
    .sort((a, b) => {
      if (b.windowDupSkips !== a.windowDupSkips) return b.windowDupSkips - a.windowDupSkips
      return (b.skipRatio ?? 0) - (a.skipRatio ?? 0)
    })
    .slice(0, limit)

  void nowMs
  return { topFreshYield, topStale, topDuplicate }
}

export function summarizeFreshAcquisitionRates(params: {
  discovered: number
  skippedExpired: number
  freshInserted: number
  cohortInserted: number
  cohortExpiredAtInsert: number
}): {
  freshInsertYield: number | null
  expiredDiscoveryRatio: number | null
  expiredInsertRatio: number | null
} {
  return {
    freshInsertYield: computeRate(params.freshInserted, params.discovered),
    expiredDiscoveryRatio: computeRate(params.skippedExpired, params.discovered),
    expiredInsertRatio: computeRate(params.cohortExpiredAtInsert, params.cohortInserted),
  }
}
