import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import type { ExternalDuplicateSkipCounts } from '@/lib/ingestion/acquisition/duplicateSkipKinds'

/** Rolling window for saturation / yield scoring. */
export const CRAWL_STATS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Minimum window fetches before treating skip ratio as saturation signal. */
export const CRAWL_SATURATION_MIN_WINDOW_FETCHED = 15

/** Skip ratio at or above this => saturated tier (deprioritized, not excluded). */
export const CRAWL_SATURATION_SKIP_RATIO = 0.92

/** Re-boost configs not crawled for this long even when saturated. */
export const CRAWL_STALE_RECrawl_MS = 14 * 24 * 60 * 60 * 1000

/** Expired-at-discovery ratio at or above this strongly deprioritizes a config. */
export const CRAWL_EXPIRED_DISCOVERY_RATIO = 0.35

export type ConfigCrawlStatsSnapshot = {
  city: string
  state: string
  source_crawl_lifetime_fetched?: number | null
  source_crawl_lifetime_skipped?: number | null
  source_crawl_lifetime_inserted?: number | null
  source_crawl_lifetime_skipped_expired?: number | null
  source_crawl_lifetime_fresh_inserted?: number | null
  source_crawl_window_fetched?: number | null
  source_crawl_window_skipped?: number | null
  source_crawl_window_inserted?: number | null
  source_crawl_window_skipped_expired?: number | null
  source_crawl_window_fresh_inserted?: number | null
  source_crawl_window_dup_existing_url?: number | null
  source_crawl_window_dup_cross_page?: number | null
  source_crawl_window_dup_canonical?: number | null
  source_crawl_window_dup_expired_row?: number | null
  source_crawl_window_started_at?: string | null
  source_crawl_last_at?: string | null
  source_crawl_last_insert_at?: string | null
}

export type ConfigCrawlRunTotals = {
  fetched: number
  skipped: number
  inserted: number
  skippedExpired?: number
  freshInserted?: number
  duplicateSkips?: ExternalDuplicateSkipCounts
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0
}

export function configScopeKey(city: string, state: string): string {
  return `${(state || '').trim()}|${(city || '').trim()}`.toLowerCase()
}

export function windowSkipRatio(stats: ConfigCrawlStatsSnapshot): number | null {
  const fetched = num(stats.source_crawl_window_fetched)
  const skipped = num(stats.source_crawl_window_skipped)
  const denom = fetched + skipped
  if (denom < CRAWL_SATURATION_MIN_WINDOW_FETCHED) return null
  return skipped / denom
}

export function windowExpiredDiscoveryRatio(stats: ConfigCrawlStatsSnapshot): number | null {
  const fetched = num(stats.source_crawl_window_fetched)
  if (fetched < CRAWL_SATURATION_MIN_WINDOW_FETCHED) return null
  return num(stats.source_crawl_window_skipped_expired) / fetched
}

export function windowFreshInsertYield(stats: ConfigCrawlStatsSnapshot): number | null {
  const fetched = num(stats.source_crawl_window_fetched)
  const fresh = num(stats.source_crawl_window_fresh_inserted)
  if (fetched < CRAWL_SATURATION_MIN_WINDOW_FETCHED) return null
  return fresh / fetched
}

export function isConfigCrawlSaturated(stats: ConfigCrawlStatsSnapshot, nowMs: number): boolean {
  const ratio = windowSkipRatio(stats)
  if (ratio == null) return false
  if (ratio < CRAWL_SATURATION_SKIP_RATIO) return false
  const lastAt = stats.source_crawl_last_at
  if (!lastAt) return true
  const lastMs = Date.parse(lastAt)
  if (!Number.isFinite(lastMs)) return true
  return nowMs - lastMs < CRAWL_STALE_RECrawl_MS
}

export function isConfigCrawlStale(stats: ConfigCrawlStatsSnapshot, nowMs: number): boolean {
  const lastAt = stats.source_crawl_last_at
  if (!lastAt) return true
  const lastMs = Date.parse(lastAt)
  if (!Number.isFinite(lastMs)) return true
  return nowMs - lastMs >= CRAWL_STALE_RECrawl_MS
}

export function hasRecentConfigInsert(stats: ConfigCrawlStatsSnapshot, nowMs: number): boolean {
  if (num(stats.source_crawl_window_fresh_inserted) > 0) return true
  if (num(stats.source_crawl_window_inserted) > 0) return true
  const lastInsert = stats.source_crawl_last_insert_at
  if (!lastInsert) return false
  const ms = Date.parse(lastInsert)
  if (!Number.isFinite(ms)) return false
  return nowMs - ms <= CRAWL_STATS_WINDOW_MS
}

export function computeConfigCrawlScheduleWeight(stats: ConfigCrawlStatsSnapshot, nowMs: number): number {
  if (!stats.source_crawl_last_at) {
    return 80
  }

  const freshYield = windowFreshInsertYield(stats)
  if (hasRecentConfigInsert(stats, nowMs)) {
    return freshYield != null && freshYield >= 0.02 ? 95 : 88
  }

  const expiredRatio = windowExpiredDiscoveryRatio(stats)
  if (expiredRatio != null && expiredRatio >= CRAWL_EXPIRED_DISCOVERY_RATIO) {
    return isConfigCrawlStale(stats, nowMs) ? 40 : 15
  }

  if (isConfigCrawlStale(stats, nowMs)) {
    return 60
  }
  if (isConfigCrawlSaturated(stats, nowMs)) {
    return 12
  }
  const ratio = windowSkipRatio(stats)
  if (ratio != null && ratio >= 0.75) {
    return 22
  }
  if (freshYield != null && freshYield >= 0.01) {
    return 72
  }
  return 50
}

type RolledWindow = {
  windowFetched: number
  windowSkipped: number
  windowInserted: number
  windowSkippedExpired: number
  windowFreshInserted: number
  windowDupExistingUrl: number
  windowDupCrossPage: number
  windowDupCanonical: number
  windowDupExpiredRow: number
  windowStartedAt: string
}

export function rollCrawlStatsWindow(stats: ConfigCrawlStatsSnapshot, nowMs: number): RolledWindow {
  const started = stats.source_crawl_window_started_at
  const startedMs = started ? Date.parse(started) : NaN
  const expired =
    !Number.isFinite(startedMs) || nowMs - startedMs >= CRAWL_STATS_WINDOW_MS
  if (expired) {
    return {
      windowFetched: 0,
      windowSkipped: 0,
      windowInserted: 0,
      windowSkippedExpired: 0,
      windowFreshInserted: 0,
      windowDupExistingUrl: 0,
      windowDupCrossPage: 0,
      windowDupCanonical: 0,
      windowDupExpiredRow: 0,
      windowStartedAt: new Date(nowMs).toISOString(),
    }
  }
  return {
    windowFetched: num(stats.source_crawl_window_fetched),
    windowSkipped: num(stats.source_crawl_window_skipped),
    windowInserted: num(stats.source_crawl_window_inserted),
    windowSkippedExpired: num(stats.source_crawl_window_skipped_expired),
    windowFreshInserted: num(stats.source_crawl_window_fresh_inserted),
    windowDupExistingUrl: num(stats.source_crawl_window_dup_existing_url),
    windowDupCrossPage: num(stats.source_crawl_window_dup_cross_page),
    windowDupCanonical: num(stats.source_crawl_window_dup_canonical),
    windowDupExpiredRow: num(stats.source_crawl_window_dup_expired_row),
    windowStartedAt: started!,
  }
}

export async function recordConfigCrawlStats(params: {
  city: string
  state: string
  totals: ConfigCrawlRunTotals
  nowMs?: number
}): Promise<void> {
  const admin = getAdminDb()
  const nowMs = params.nowMs ?? Date.now()
  const nowIso = new Date(nowMs).toISOString()

  const { data: row, error: fetchErr } = await fromBase(admin, 'ingestion_city_configs')
    .select(
      'city, state, source_crawl_lifetime_fetched, source_crawl_lifetime_skipped, source_crawl_lifetime_inserted, source_crawl_lifetime_skipped_expired, source_crawl_lifetime_fresh_inserted, source_crawl_window_fetched, source_crawl_window_skipped, source_crawl_window_inserted, source_crawl_window_skipped_expired, source_crawl_window_fresh_inserted, source_crawl_window_dup_existing_url, source_crawl_window_dup_cross_page, source_crawl_window_dup_canonical, source_crawl_window_dup_expired_row, source_crawl_window_started_at, source_crawl_last_at, source_crawl_last_insert_at'
    )
    .eq('city', params.city)
    .eq('state', params.state)
    .maybeSingle()

  if (fetchErr) {
    logger.warn('Failed to load config crawl stats for update', {
      component: 'ingestion/acquisition/configCrawlStats',
      operation: 'record_load',
      city: params.city,
      state: params.state,
      message: fetchErr.message,
    })
    return
  }

  const prior = (row ?? {}) as ConfigCrawlStatsSnapshot
  const window = rollCrawlStatsWindow(prior, nowMs)
  const fetched = Math.max(0, params.totals.fetched)
  const skipped = Math.max(0, params.totals.skipped)
  const inserted = Math.max(0, params.totals.inserted)
  const skippedExpired = Math.max(0, params.totals.skippedExpired ?? 0)
  const freshInserted = Math.max(0, params.totals.freshInserted ?? inserted)
  const dup = params.totals.duplicateSkips

  const payload: Record<string, unknown> = {
    source_crawl_lifetime_fetched: num(prior.source_crawl_lifetime_fetched) + fetched,
    source_crawl_lifetime_skipped: num(prior.source_crawl_lifetime_skipped) + skipped,
    source_crawl_lifetime_inserted: num(prior.source_crawl_lifetime_inserted) + inserted,
    source_crawl_lifetime_skipped_expired:
      num(prior.source_crawl_lifetime_skipped_expired) + skippedExpired,
    source_crawl_lifetime_fresh_inserted:
      num(prior.source_crawl_lifetime_fresh_inserted) + freshInserted,
    source_crawl_window_fetched: window.windowFetched + fetched,
    source_crawl_window_skipped: window.windowSkipped + skipped,
    source_crawl_window_inserted: window.windowInserted + inserted,
    source_crawl_window_skipped_expired: window.windowSkippedExpired + skippedExpired,
    source_crawl_window_fresh_inserted: window.windowFreshInserted + freshInserted,
    source_crawl_window_dup_existing_url:
      window.windowDupExistingUrl + (dup?.duplicate_existing_url ?? 0),
    source_crawl_window_dup_cross_page:
      window.windowDupCrossPage + (dup?.duplicate_cross_city_page ?? 0),
    source_crawl_window_dup_canonical:
      window.windowDupCanonical + (dup?.duplicate_canonical_collision ?? 0),
    source_crawl_window_dup_expired_row:
      window.windowDupExpiredRow + (dup?.duplicate_expired_row ?? 0),
    source_crawl_window_started_at: window.windowStartedAt,
    source_crawl_last_at: nowIso,
  }
  if (freshInserted > 0) {
    payload.source_crawl_last_insert_at = nowIso
  }

  const { error: upErr } = await fromBase(admin, 'ingestion_city_configs')
    .update(payload)
    .eq('city', params.city)
    .eq('state', params.state)

  if (upErr) {
    logger.warn('Failed to persist config crawl stats', {
      component: 'ingestion/acquisition/configCrawlStats',
      operation: 'record_update',
      city: params.city,
      state: params.state,
      message: upErr.message,
    })
  }
}

export function countSaturatedFromStatsRows(
  rows: ConfigCrawlStatsSnapshot[],
  nowMs: number
): number {
  let n = 0
  for (const row of rows) {
    if (isConfigCrawlSaturated(row, nowMs)) n += 1
  }
  return n
}

export function averageWindowInsertYield(rows: ConfigCrawlStatsSnapshot[]): number | null {
  let fetched = 0
  let inserted = 0
  for (const row of rows) {
    fetched += num(row.source_crawl_window_fetched)
    inserted += num(row.source_crawl_window_fresh_inserted) || num(row.source_crawl_window_inserted)
  }
  if (fetched <= 0) return null
  return Math.round((inserted / fetched) * 10000) / 10000
}
