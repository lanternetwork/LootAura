import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import {
  aggregateOrchestrationRuns,
  computeCrawlScheduleEstimates,
  computeRate,
  oldestAgeMsFromTimestamp,
  type OrchestrationRunRow,
} from '@/lib/admin/ingestionVolumeMetricsHelpers'
import {
  parseIngestionOrchestrationConfigBatchSizeForMetrics,
  parseIngestionOrchestrationMinMinutesForMetrics,
} from '@/lib/admin/ingestionVolumeMetricsConfig'
import { fetchLastSuccessfulExternalIngestionAt } from '@/lib/ingestion/orchestrationMetrics'
import {
  ADAPTIVE_METRICS_STALE_MS,
  type AdaptiveCaps,
} from '@/lib/ingestion/adaptiveThroughputConfig'
import {
  parseAdaptiveDwellFromNotes,
  resolveAdaptiveThroughput,
  type AdaptiveDwellState,
  type AdaptivePressureSignals,
} from '@/lib/ingestion/adaptiveThroughputProfile'
import { INGESTION_ORCHESTRATION_DEFAULTS } from '@/lib/ingestion/ingestionOrchestrationDefaults'
import { logger } from '@/lib/log'

const ORCHESTRATION_ROWS_LIMIT = 80

export async function loadAdaptiveDwellState(): Promise<AdaptiveDwellState | null> {
  try {
    const admin = getAdminDb()
    const { data, error } = await fromBase(admin, 'ingestion_orchestration_runs')
      .select('notes, created_at')
      .not('notes', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error || !Array.isArray(data)) {
      return null
    }

    for (const row of data as { notes: Record<string, unknown> | null }[]) {
      const notes = row.notes
      if (!notes) continue
      const direct = parseAdaptiveDwellFromNotes(notes)
      if (direct) return direct
      const ext = notes.external_ingestion as Record<string, unknown> | undefined
      if (ext) {
        const nested = parseAdaptiveDwellFromNotes({ adaptive: ext.adaptive as Record<string, unknown> })
        if (nested) return nested
      }
      const gc = notes.geocode_cron as Record<string, unknown> | undefined
      if (gc) {
        const nested = parseAdaptiveDwellFromNotes({ adaptive: gc.adaptive as Record<string, unknown> })
        if (nested) return nested
      }
    }
    return null
  } catch (err) {
    logger.warn('loadAdaptiveDwellState failed', {
      component: 'ingestion/adaptiveThroughputSignals',
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function loadAdaptivePressureSignals(nowMs = Date.now()): Promise<AdaptivePressureSignals> {
  const unavailable: AdaptivePressureSignals = {
    metricsAvailable: false,
    metricsStale: true,
    needsGeocodeCount: 0,
    oldestNeedsGeocodeAgeMs: null,
    readyCount: 0,
    oldestReadyAgeMs: null,
    crawlableConfigsTotal: 0,
    configsDueForCrawl: 0,
    configsOverdue: 0,
    fetchFailureRate24h: null,
    fetchBudgetExitCount24h: 0,
    rate429Count24h: 0,
    geocodeRetryableFailed24h: 0,
    geocodeTerminalFailed24h: 0,
    publishFailed24h: 0,
    publishAttempted24h: 0,
    recentOrchestrationDurationMsAvg: null,
    recentFetchBudgetExitRuns: 0,
    recentOrchestrationErrorRuns: 0,
    fetchHealthyForElevation: false,
  }

  try {
    const admin = getAdminDb()
    const iso48h = new Date(nowMs - 48 * 60 * 60 * 1000).toISOString()

    const needsGeocodePromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_geocode')

    const readyPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ready')

    const oldestNeedsPromise = fromBase(admin, 'ingested_sales')
      .select('created_at')
      .eq('status', 'needs_geocode')
      .order('created_at', { ascending: true })
      .limit(1)

    const oldestReadyPromise = fromBase(admin, 'ingested_sales')
      .select('updated_at')
      .eq('status', 'ready')
      .order('updated_at', { ascending: true })
      .limit(1)

    const orchestrationStatePromise = fromBase(admin, 'ingestion_orchestration_state')
      .select('cursor')
      .eq('key', 'external_page_source')
      .limit(1)

    const orchestrationRowsPromise = fromBase(admin, 'ingestion_orchestration_runs')
      .select(
        'created_at, mode, duration_ms, batch_size, concurrency, claimed_count, geocode_succeeded_count, failed_retriable_count, failed_terminal_count, publish_attempted_count, publish_succeeded_count, publish_failed_count, publish_expired_count, publish_skipped_count, rate_429_count, notes'
      )
      .gte('created_at', iso48h)
      .order('created_at', { ascending: false })
      .limit(ORCHESTRATION_ROWS_LIMIT)

    const lastFetchPromise = fetchLastSuccessfulExternalIngestionAt()

    const [
      needsGeocodeResult,
      readyResult,
      oldestNeedsResult,
      oldestReadyResult,
      orchestrationStateResult,
      orchestrationRowsResult,
      lastSuccessfulFetchAt,
    ] = await Promise.all([
      needsGeocodePromise,
      readyPromise,
      oldestNeedsPromise,
      oldestReadyPromise,
      orchestrationStatePromise,
      orchestrationRowsPromise,
      lastFetchPromise,
    ])

    if (
      needsGeocodeResult.error ||
      readyResult.error ||
      orchestrationRowsResult.error
    ) {
      return unavailable
    }

    const orchRows = (orchestrationRowsResult.data || []) as OrchestrationRunRow[]
    const agg = aggregateOrchestrationRuns(orchRows, 48, nowMs)
    const fetchRollup = agg.fetchRollup24h
    const geocodeRollup = agg.geocodeRollup24h
    const publishRollup = agg.publishRollup24h

    const newestRunMs =
      orchRows.length > 0 && orchRows[0]?.created_at
        ? Date.parse(orchRows[0].created_at)
        : null
    const metricsStale =
      newestRunMs == null || !Number.isFinite(newestRunMs) || nowMs - newestRunMs > ADAPTIVE_METRICS_STALE_MS

    const orchestrationCursor =
      (orchestrationStateResult.data?.[0] as { cursor?: number } | undefined)?.cursor ?? 0

    const crawlableConfigsTotal = agg.latestExternalNote?.configsCrawlable ?? 0
    const crawlSchedule = computeCrawlScheduleEstimates({
      crawlableConfigsTotal,
      orchestrationCursor,
      defaultBatchSize: parseIngestionOrchestrationConfigBatchSizeForMetrics(),
      minIntervalMinutes: parseIngestionOrchestrationMinMinutesForMetrics(),
      lastSuccessfulExternalIngestionAt: lastSuccessfulFetchAt,
      latestCompletedNote: agg.latestExternalNote,
      nowMs,
    })

    const recentIngestionRuns = orchRows
      .filter((r) => r.mode === 'ingestion' || r.mode === 'daily')
      .slice(0, 6)
    let recentDurationSum = 0
    let recentDurationCount = 0
    let recentFetchBudgetExitRuns = 0
    let recentOrchestrationErrorRuns = 0
    for (const row of recentIngestionRuns) {
      if (row.duration_ms > 0) {
        recentDurationSum += row.duration_ms
        recentDurationCount += 1
      }
      const ext = row.notes?.external_ingestion
      if (ext?.budgetExit === true) {
        recentFetchBudgetExitRuns += 1
      }
      if (ext?.status === 'failed') {
        recentOrchestrationErrorRuns += 1
      }
      const gc = row.notes?.geocode_cron
      if (gc && gc.ok === false) {
        recentOrchestrationErrorRuns += 1
      }
    }

    const fetchFailureRate24h = computeRate(fetchRollup.fetchErrors, fetchRollup.fetchDenominator)

    const fetchHealthyForElevation =
      geocodeRollup.rate429 < 5 &&
      fetchRollup.budgetExitCount < 2 &&
      (fetchFailureRate24h == null || fetchFailureRate24h < 0.2) &&
      recentFetchBudgetExitRuns < 2

    const oldestNeedsRow = oldestNeedsResult.data?.[0] as { created_at?: string } | undefined
    const oldestReadyRow = oldestReadyResult.data?.[0] as { updated_at?: string } | undefined

    return {
      metricsAvailable: true,
      metricsStale,
      needsGeocodeCount: needsGeocodeResult.count ?? 0,
      oldestNeedsGeocodeAgeMs: oldestAgeMsFromTimestamp(oldestNeedsRow?.created_at, nowMs),
      readyCount: readyResult.count ?? 0,
      oldestReadyAgeMs: oldestAgeMsFromTimestamp(oldestReadyRow?.updated_at, nowMs),
      crawlableConfigsTotal,
      configsDueForCrawl: crawlSchedule.configsDueForCrawl,
      configsOverdue: crawlSchedule.configsOverdue,
      fetchFailureRate24h,
      fetchBudgetExitCount24h: fetchRollup.budgetExitCount,
      rate429Count24h: geocodeRollup.rate429,
      geocodeRetryableFailed24h: geocodeRollup.retryableFailed,
      geocodeTerminalFailed24h: geocodeRollup.terminalFailed,
      publishFailed24h: publishRollup.failed,
      publishAttempted24h: publishRollup.attempted,
      recentOrchestrationDurationMsAvg:
        recentDurationCount > 0 ? Math.round(recentDurationSum / recentDurationCount) : null,
      recentFetchBudgetExitRuns,
      recentOrchestrationErrorRuns,
      fetchHealthyForElevation,
    }
  } catch (err) {
    logger.warn('loadAdaptivePressureSignals failed', {
      component: 'ingestion/adaptiveThroughputSignals',
      message: err instanceof Error ? err.message : String(err),
    })
    return unavailable
  }
}

export async function resolveAdaptiveThroughputForCron(caps?: AdaptiveCaps) {
  const [signals, previousDwell] = await Promise.all([
    loadAdaptivePressureSignals(),
    loadAdaptiveDwellState(),
  ])
  return resolveAdaptiveThroughput({ signals, previousDwell, caps })
}
