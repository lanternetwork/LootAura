import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import type { ExternalDuplicateSkipCounts } from '@/lib/ingestion/acquisition/duplicateSkipKinds'
import { DETAIL_FIRST_SUCCESS_RATE_TARGET } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'

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
  source_crawl_window_detail_first_attempted?: number | null
  source_crawl_window_detail_first_succeeded?: number | null
  source_crawl_lifetime_detail_first_attempted?: number | null
  source_crawl_lifetime_detail_first_succeeded?: number | null
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
  detailFirstAttempted?: number
  detailFirstSucceeded?: number
}

/** Minimum detail-first attempts in the rolling window before yield affects scheduling. */
export const CRAWL_DETAIL_FIRST_MIN_WINDOW_ATTEMPTS = 8

/** Detail-first ready rate at or above this boosts crawl priority (visible-active capture). */
export const CRAWL_DETAIL_FIRST_HIGH_YIELD_RATE = 0.12

/** Detail-first ready rate below this with enough attempts deprioritizes saturated configs. */
export const CRAWL_DETAIL_FIRST_LOW_YIELD_RATE = 0.02

/** Columns from migration 188 (always required for crawl scheduling). */
export const INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_BASE =
  'source_crawl_lifetime_fetched, source_crawl_lifetime_skipped, source_crawl_lifetime_inserted, source_crawl_window_fetched, source_crawl_window_skipped, source_crawl_window_inserted, source_crawl_window_started_at, source_crawl_last_at, source_crawl_last_insert_at'

/** Columns from migration 191 (optional until applied on the target database). */
export const INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_3A =
  'source_crawl_lifetime_skipped_expired, source_crawl_lifetime_fresh_inserted, source_crawl_window_skipped_expired, source_crawl_window_fresh_inserted, source_crawl_window_dup_existing_url, source_crawl_window_dup_cross_page, source_crawl_window_dup_canonical, source_crawl_window_dup_expired_row'

/** Columns from migration 192 (optional until applied on the target database). */
export const INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_4 =
  'source_crawl_lifetime_detail_first_attempted, source_crawl_lifetime_detail_first_succeeded, source_crawl_window_detail_first_attempted, source_crawl_window_detail_first_succeeded'

export const INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_3A_AND_4 = `${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_3A}, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_4}`

export const ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_BASE =
  `city, state, source_platform, source_pages, source_crawl_excluded_at, source_discovery_status, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_BASE}`

export const ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_PHASE_3A =
  INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_3A

export const ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_PHASE_3A_AND_4 =
  INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_3A_AND_4

function isMissingCrawlStatsColumnError(message: string): boolean {
  return /does not exist/i.test(message) && /ingestion_city_configs/i.test(message)
}

export async function fetchFunnelLeaderboardConfigRows(
  admin: ReturnType<typeof getAdminDb>
): Promise<ConfigCrawlStatsSnapshot[]> {
  const extended = `city, state, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_BASE}, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_3A_AND_4}`
  const legacy = `city, state, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_BASE}`
  const pageSize = 1000
  let from = 0
  const out: ConfigCrawlStatsSnapshot[] = []
  let useLegacy = false

  for (;;) {
    const { data, error } = useLegacy
      ? await fromBase(admin, 'ingestion_city_configs')
          .select(legacy)
          .eq('enabled', true)
          .eq('source_platform', 'external_page_source')
          .range(from, from + pageSize - 1)
      : await fromBase(admin, 'ingestion_city_configs')
          .select(extended)
          .eq('enabled', true)
          .eq('source_platform', 'external_page_source')
          .range(from, from + pageSize - 1)
    if (error) {
      if (!useLegacy && isMissingCrawlStatsColumnError(error.message)) {
        useLegacy = true
        from = 0
        out.length = 0
        continue
      }
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as unknown as ConfigCrawlStatsSnapshot[]
    out.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return out
}

export async function fetchEnabledExternalIngestionCityConfigs(
  admin: ReturnType<typeof getAdminDb>
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const extended = `${ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_BASE}, ${ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_PHASE_3A_AND_4}`
  const extendedResult = await fromBase(admin, 'ingestion_city_configs')
    .select(extended)
    .eq('enabled', true)
  if (!extendedResult.error) {
    return extendedResult
  }
  if (!isMissingCrawlStatsColumnError(extendedResult.error.message)) {
    return extendedResult
  }
  const phase3aOnly = `${ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_BASE}, ${ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_PHASE_3A}`
  const phase3aResult = await fromBase(admin, 'ingestion_city_configs')
    .select(phase3aOnly)
    .eq('enabled', true)
  if (!phase3aResult.error) {
    return phase3aResult
  }
  if (!isMissingCrawlStatsColumnError(phase3aResult.error.message)) {
    return phase3aResult
  }
  return fromBase(admin, 'ingestion_city_configs')
    .select(ENABLED_EXTERNAL_INGESTION_CONFIG_SELECT_BASE)
    .eq('enabled', true)
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

export function windowDetailFirstReadyRate(stats: ConfigCrawlStatsSnapshot): number | null {
  const attempted = num(stats.source_crawl_window_detail_first_attempted)
  if (attempted < CRAWL_DETAIL_FIRST_MIN_WINDOW_ATTEMPTS) return null
  return num(stats.source_crawl_window_detail_first_succeeded) / attempted
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
    const provenDetailFirstRate = windowDetailFirstReadyRate(stats)
    if (
      provenDetailFirstRate != null &&
      provenDetailFirstRate >= DETAIL_FIRST_SUCCESS_RATE_TARGET
    ) {
      return 42
    }
    return 12
  }
  const ratio = windowSkipRatio(stats)
  if (ratio != null && ratio >= 0.75) {
    return 22
  }
  if (freshYield != null && freshYield >= 0.01) {
    return 72
  }

  const detailFirstRate = windowDetailFirstReadyRate(stats)
  if (detailFirstRate != null && detailFirstRate >= CRAWL_DETAIL_FIRST_HIGH_YIELD_RATE) {
    return Math.min(98, 85)
  }
  if (
    detailFirstRate != null &&
    detailFirstRate < CRAWL_DETAIL_FIRST_LOW_YIELD_RATE &&
    num(stats.source_crawl_window_detail_first_attempted) >= CRAWL_DETAIL_FIRST_MIN_WINDOW_ATTEMPTS * 2
  ) {
    return isConfigCrawlStale(stats, nowMs) ? 35 : 18
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
  windowDetailFirstAttempted: number
  windowDetailFirstSucceeded: number
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
      windowDetailFirstAttempted: 0,
      windowDetailFirstSucceeded: 0,
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
    windowDetailFirstAttempted: num(stats.source_crawl_window_detail_first_attempted),
    windowDetailFirstSucceeded: num(stats.source_crawl_window_detail_first_succeeded),
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

  const rowSelectExtended = `city, state, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_BASE}, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_PHASE_3A_AND_4}`
  let rowResult = await fromBase(admin, 'ingestion_city_configs')
    .select(rowSelectExtended)
    .eq('city', params.city)
    .eq('state', params.state)
    .maybeSingle()
  if (rowResult.error && isMissingCrawlStatsColumnError(rowResult.error.message)) {
    rowResult = await fromBase(admin, 'ingestion_city_configs')
      .select(`city, state, ${INGESTION_CITY_CONFIG_CRAWL_STATS_SELECT_BASE}`)
      .eq('city', params.city)
      .eq('state', params.state)
      .maybeSingle()
  }
  const { data: row, error: fetchErr } = rowResult

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

  const prior = (row ?? {}) as unknown as ConfigCrawlStatsSnapshot
  const window = rollCrawlStatsWindow(prior, nowMs)
  const fetched = Math.max(0, params.totals.fetched)
  const skipped = Math.max(0, params.totals.skipped)
  const inserted = Math.max(0, params.totals.inserted)
  const skippedExpired = Math.max(0, params.totals.skippedExpired ?? 0)
  const freshInserted = Math.max(0, params.totals.freshInserted ?? inserted)
  const dup = params.totals.duplicateSkips
  const detailFirstAttempted = Math.max(0, params.totals.detailFirstAttempted ?? 0)
  const detailFirstSucceeded = Math.max(0, params.totals.detailFirstSucceeded ?? 0)

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
    source_crawl_lifetime_detail_first_attempted:
      num(prior.source_crawl_lifetime_detail_first_attempted) + detailFirstAttempted,
    source_crawl_lifetime_detail_first_succeeded:
      num(prior.source_crawl_lifetime_detail_first_succeeded) + detailFirstSucceeded,
    source_crawl_window_detail_first_attempted:
      window.windowDetailFirstAttempted + detailFirstAttempted,
    source_crawl_window_detail_first_succeeded:
      window.windowDetailFirstSucceeded + detailFirstSucceeded,
    source_crawl_window_started_at: window.windowStartedAt,
    source_crawl_last_at: nowIso,
  }
  if (freshInserted > 0) {
    payload.source_crawl_last_insert_at = nowIso
  }

  const legacyPayload: Record<string, unknown> = {
    source_crawl_lifetime_fetched: payload.source_crawl_lifetime_fetched,
    source_crawl_lifetime_skipped: payload.source_crawl_lifetime_skipped,
    source_crawl_lifetime_inserted: payload.source_crawl_lifetime_inserted,
    source_crawl_window_fetched: payload.source_crawl_window_fetched,
    source_crawl_window_skipped: payload.source_crawl_window_skipped,
    source_crawl_window_inserted: payload.source_crawl_window_inserted,
    source_crawl_window_started_at: payload.source_crawl_window_started_at,
    source_crawl_last_at: payload.source_crawl_last_at,
  }
  if (freshInserted > 0) {
    legacyPayload.source_crawl_last_insert_at = nowIso
  }

  let upErr = (
    await fromBase(admin, 'ingestion_city_configs')
      .update(payload)
      .eq('city', params.city)
      .eq('state', params.state)
  ).error

  if (upErr && isMissingCrawlStatsColumnError(upErr.message)) {
    upErr = (
      await fromBase(admin, 'ingestion_city_configs')
        .update(legacyPayload)
        .eq('city', params.city)
        .eq('state', params.state)
    ).error
  }

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
