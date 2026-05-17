/**
 * Pure helpers for Phase A ingestion volume / backlog observability (no I/O).
 */

import type { DedupeDecisionAggregate } from '@/lib/ingestion/dedupe'
import type { ExternalIngestionOrchestrationNote } from '@/lib/ingestion/orchestrationMetrics'

export const METRICS_HOURS = 48
export const METRICS_LAST_HOUR_MS = 60 * 60 * 1000

export type HourCountSeries = Array<{ bucket: string; count: number }>

export type OrchestrationRunRow = {
  created_at: string
  mode: string
  duration_ms: number
  batch_size: number
  concurrency: number
  claimed_count: number
  geocode_succeeded_count: number
  failed_retriable_count: number
  failed_terminal_count: number
  publish_attempted_count: number
  publish_succeeded_count: number
  publish_failed_count: number
  publish_skipped_count: number
  publish_expired_count?: number
  rate_429_count: number
  notes: Record<string, unknown> | null
}

export type FetchRollup24h = {
  sourcePagesFetched: number
  configsProcessed: number
  listingsDiscovered: number
  listingsInserted: number
  listingsSkipped: number
  duplicateSkips: number
  dedupeDenominator: number
  parserInvalid: number
  fetchErrors: number
  fetchDenominator: number
  budgetExitCount: number
  externalFetchDurationMsSum: number
  externalFetchDurationSampleCount: number
  completedRunCount: number
}

export type GeocodeRollup24h = {
  succeeded: number
  retryableFailed: number
  terminalFailed: number
  rate429: number
  claimed: number
}

export type PublishRollup24h = {
  attempted: number
  succeeded: number
  failed: number
  skipped: number
  duplicateReuse: number
}

export type ReconciliationRollup24h = {
  runCount: number
  candidatePageRpcOkCount: number
  candidatePageRpcFailCount: number
  processed: number
  scheduleMutationInhibited: number
  salesSyncUpdated: number
}

export type DiscoveryRollup24h = {
  runCount: number
  configsPromoted: number
  configsRepaired: number
}

export type IngestionBottleneck =
  | 'fetch'
  | 'geocode'
  | 'publish'
  | 'discovery'
  | 'reconciliation'
  | 'db_provider_pressure'
  | 'none'

export function hourFloorUtc(iso: string): string {
  const d = new Date(iso)
  d.setUTCMinutes(0, 0, 0)
  d.setUTCMilliseconds(0)
  return d.toISOString()
}

export function buildEmptyHourBuckets(hours: number, nowMs = Date.now()): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * 3600000)
    d.setUTCMinutes(0, 0, 0)
    d.setUTCMilliseconds(0)
    map.set(d.toISOString(), 0)
  }
  return map
}

export function mapToSortedSeries(m: Map<string, number>): HourCountSeries {
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, count]) => ({ bucket, count }))
}

export function mapToSortedDurationAvg(
  sumByHour: Map<string, number>,
  countByHour: Map<string, number>
): Array<{ bucket: string; value: number }> {
  return [...sumByHour.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, sumMs]) => {
      const n = countByHour.get(bucket) ?? 0
      return { bucket, value: n > 0 ? Math.round(sumMs / n) : 0 }
    })
}

export function sumLastHourFromSeries(series: HourCountSeries, nowMs = Date.now()): number {
  const cutoff = hourFloorUtc(new Date(nowMs - METRICS_LAST_HOUR_MS).toISOString())
  return series.filter((row) => row.bucket >= cutoff).reduce((a, row) => a + row.count, 0)
}

function asExternalNote(notes: Record<string, unknown> | null): ExternalIngestionOrchestrationNote | null {
  if (!notes || typeof notes !== 'object') return null
  const ext = notes.external_ingestion
  if (!ext || typeof ext !== 'object') return null
  return ext as ExternalIngestionOrchestrationNote
}

function asDiscoveryNote(notes: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!notes || typeof notes !== 'object') return null
  const d = notes.discovery_cron
  if (!d || typeof d !== 'object') return null
  return d as Record<string, unknown>
}

function asReconciliationNote(notes: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!notes || typeof notes !== 'object') return null
  const r = notes.reconciliation_cron
  if (!r || typeof r !== 'object') return null
  return r as Record<string, unknown>
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function dedupeSkipCountFromAggregate(agg: DedupeDecisionAggregate | undefined): number {
  if (!agg) return 0
  return (
    agg.source_url +
    agg.exact_address_date +
    agg.soft_date_window +
    (agg.duplicateDecisionTrue ?? 0)
  )
}

export function dedupeDenominatorFromAggregate(agg: DedupeDecisionAggregate | undefined): number {
  if (!agg) return 0
  const skips = dedupeSkipCountFromAggregate(agg)
  return skips + (agg.no_match ?? 0) + (agg.soft_duplicate_rejected ?? 0)
}

export function computeDuplicateSkipRate(skips: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((skips / denominator) * 10000) / 10000
}

export function computeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 10000) / 10000
}

export function computeCrawlScheduleEstimates(params: {
  crawlableConfigsTotal: number
  orchestrationCursor: number
  defaultBatchSize: number
  minIntervalMinutes: number
  lastSuccessfulExternalIngestionAt: string | null
  latestCompletedNote: ExternalIngestionOrchestrationNote | null
  nowMs: number
}): { configsDueForCrawl: number; configsOverdue: number; estimatedFullRotationMinutes: number } {
  const total = Math.max(0, params.crawlableConfigsTotal)
  const batch = Math.max(1, params.defaultBatchSize)
  const slotsPerCycle = Math.max(1, Math.ceil(total / batch))
  const estimatedFullRotationMinutes = slotsPerCycle * Math.max(1, params.minIntervalMinutes)

  const configsRemaining = params.latestCompletedNote?.configsRemaining ?? 0
  const budgetExit = params.latestCompletedNote?.budgetExit === true
  const configsDueFromLastRun = budgetExit
    ? Math.min(total, Math.max(0, configsRemaining))
    : Math.min(total, batch)

  let configsOverdue = 0
  if (total > 0 && params.lastSuccessfulExternalIngestionAt) {
    const lastMs = Date.parse(params.lastSuccessfulExternalIngestionAt)
    if (Number.isFinite(lastMs)) {
      const elapsedMin = (params.nowMs - lastMs) / 60000
      if (elapsedMin > estimatedFullRotationMinutes * 1.25) {
        configsOverdue = total
      } else if (elapsedMin > params.minIntervalMinutes * 1.5) {
        configsOverdue = Math.min(total, Math.max(configsDueFromLastRun, Math.ceil(total * 0.1)))
      }
    }
  }

  const cursorLag = total > 0 ? (params.orchestrationCursor % total) : 0
  const configsDueForCrawl =
    total === 0
      ? 0
      : Math.min(total, Math.max(configsDueFromLastRun, Math.min(batch, total - cursorLag)))

  return {
    configsDueForCrawl,
    configsOverdue,
    estimatedFullRotationMinutes,
  }
}

export function aggregateOrchestrationRuns(
  rows: OrchestrationRunRow[],
  hours: number,
  nowMs = Date.now()
): {
  fetchHourly: Map<string, number>
  configsProcessedHourly: Map<string, number>
  insertedHourly: Map<string, number>
  listingsDiscoveredHourly: Map<string, number>
  geocodeSuccessHourly: Map<string, number>
  geocodeRetryableHourly: Map<string, number>
  geocodeTerminalHourly: Map<string, number>
  rate429Hourly: Map<string, number>
  publishAttemptedHourly: Map<string, number>
  publishSuccessHourly: Map<string, number>
  publishFailedHourly: Map<string, number>
  publishExpiredHourly: Map<string, number>
  claimedHourly: Map<string, number>
  durationSumByHour: Map<string, number>
  durationCountByHour: Map<string, number>
  fetchRollup24h: FetchRollup24h
  geocodeRollup24h: GeocodeRollup24h
  publishRollup24h: PublishRollup24h
  reconciliationRollup24h: ReconciliationRollup24h
  discoveryRollup24h: DiscoveryRollup24h
  latestGeocodeConcurrency: number | null
  lockSkippedRuns48h: number
  budgetExitRuns48h: number
  overlapPreventionEvents48h: number
  latestExternalNote: ExternalIngestionOrchestrationNote | null
} {
  const iso24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  const fetchHourly = buildEmptyHourBuckets(hours, nowMs)
  const configsProcessedHourly = buildEmptyHourBuckets(hours, nowMs)
  const insertedHourly = buildEmptyHourBuckets(hours, nowMs)
  const listingsSkippedHourly = buildEmptyHourBuckets(hours, nowMs)
  const listingsDiscoveredHourly = buildEmptyHourBuckets(hours, nowMs)
  const geocodeSuccessHourly = buildEmptyHourBuckets(hours, nowMs)
  const geocodeRetryableHourly = buildEmptyHourBuckets(hours, nowMs)
  const geocodeTerminalHourly = buildEmptyHourBuckets(hours, nowMs)
  const rate429Hourly = buildEmptyHourBuckets(hours, nowMs)
  const publishAttemptedHourly = buildEmptyHourBuckets(hours, nowMs)
  const publishSuccessHourly = buildEmptyHourBuckets(hours, nowMs)
  const publishFailedHourly = buildEmptyHourBuckets(hours, nowMs)
  const publishExpiredHourly = buildEmptyHourBuckets(hours, nowMs)
  const claimedHourly = buildEmptyHourBuckets(hours, nowMs)
  const durationSumByHour = buildEmptyHourBuckets(hours, nowMs)
  const durationCountByHour = buildEmptyHourBuckets(hours, nowMs)

  const fetchRollup24h: FetchRollup24h = {
    sourcePagesFetched: 0,
    configsProcessed: 0,
    listingsDiscovered: 0,
    listingsInserted: 0,
    listingsSkipped: 0,
    duplicateSkips: 0,
    dedupeDenominator: 0,
    parserInvalid: 0,
    fetchErrors: 0,
    fetchDenominator: 0,
    budgetExitCount: 0,
    externalFetchDurationMsSum: 0,
    externalFetchDurationSampleCount: 0,
    completedRunCount: 0,
  }

  const geocodeRollup24h: GeocodeRollup24h = {
    succeeded: 0,
    retryableFailed: 0,
    terminalFailed: 0,
    rate429: 0,
    claimed: 0,
  }

  const publishRollup24h: PublishRollup24h = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    duplicateReuse: 0,
  }

  const reconciliationRollup24h: ReconciliationRollup24h = {
    runCount: 0,
    candidatePageRpcOkCount: 0,
    candidatePageRpcFailCount: 0,
    processed: 0,
    scheduleMutationInhibited: 0,
    salesSyncUpdated: 0,
  }

  const discoveryRollup24h: DiscoveryRollup24h = {
    runCount: 0,
    configsPromoted: 0,
    configsRepaired: 0,
  }

  let lockSkippedRuns48h = 0
  let budgetExitRuns48h = 0
  let overlapPreventionEvents48h = 0
  let latestExternalNote: ExternalIngestionOrchestrationNote | null = null
  let latestGeocodeConcurrency: number | null = null

  for (const row of rows) {
    if (!row.created_at) continue
    const k = hourFloorUtc(row.created_at)
    const in24h = row.created_at >= iso24h

    if (durationSumByHour.has(k)) {
      durationSumByHour.set(k, (durationSumByHour.get(k) ?? 0) + row.duration_ms)
      durationCountByHour.set(k, (durationCountByHour.get(k) ?? 0) + 1)
    }

    const ext = asExternalNote(row.notes)
    if (ext) {
      if (ext.lockSkipped === true) lockSkippedRuns48h += 1
      if (ext.budgetExit === true) budgetExitRuns48h += 1
      if (ext.overlapPrevented === true) overlapPreventionEvents48h += 1
      if (ext.status === 'completed' && !latestExternalNote) {
        latestExternalNote = ext
      }
    }

    if (row.mode === 'discovery_cron') {
      const d = asDiscoveryNote(row.notes)
      if (in24h && d) {
        discoveryRollup24h.runCount += 1
        discoveryRollup24h.configsPromoted += num(d.configsPromoted)
        discoveryRollup24h.configsRepaired += num(d.configsRepaired)
      }
      continue
    }

    if (row.mode === 'reconciliation_cron') {
      const r = asReconciliationNote(row.notes)
      if (in24h && r) {
        reconciliationRollup24h.runCount += 1
        reconciliationRollup24h.processed += num(r.processed)
        reconciliationRollup24h.scheduleMutationInhibited += num(r.scheduleMutationInhibited)
        reconciliationRollup24h.salesSyncUpdated += num(r.salesSyncUpdated)
        if (r.candidatePageRpcOk === true) {
          reconciliationRollup24h.candidatePageRpcOkCount += 1
        } else if (r.candidatePageRpcOk === false) {
          reconciliationRollup24h.candidatePageRpcFailCount += 1
        }
      }
      continue
    }

    if (row.mode === 'geocode_cron' || row.mode === 'daily' || row.mode === 'ingestion') {
      if (latestGeocodeConcurrency === null && row.concurrency > 0) {
        latestGeocodeConcurrency = row.concurrency
      }
    }

    if (row.mode !== 'daily' && row.mode !== 'ingestion') {
      continue
    }

    rate429Hourly.set(k, (rate429Hourly.get(k) ?? 0) + row.rate_429_count)
    claimedHourly.set(k, (claimedHourly.get(k) ?? 0) + row.claimed_count)
    geocodeSuccessHourly.set(k, (geocodeSuccessHourly.get(k) ?? 0) + row.geocode_succeeded_count)
    geocodeRetryableHourly.set(k, (geocodeRetryableHourly.get(k) ?? 0) + row.failed_retriable_count)
    geocodeTerminalHourly.set(k, (geocodeTerminalHourly.get(k) ?? 0) + row.failed_terminal_count)
    publishAttemptedHourly.set(k, (publishAttemptedHourly.get(k) ?? 0) + row.publish_attempted_count)
    publishSuccessHourly.set(k, (publishSuccessHourly.get(k) ?? 0) + row.publish_succeeded_count)
    publishFailedHourly.set(k, (publishFailedHourly.get(k) ?? 0) + row.publish_failed_count)
    publishExpiredHourly.set(k, (publishExpiredHourly.get(k) ?? 0) + (row.publish_expired_count ?? 0))

    if (!in24h || !ext || ext.status !== 'completed') {
      continue
    }

    fetchRollup24h.completedRunCount += 1
    const pages = num(ext.pagesProcessed)
    const processed = num(ext.configsProcessed)
    const fetched = num(ext.fetched)
    const inserted = num(ext.inserted)
    const skipped = num(ext.skipped)
    const invalid = num(ext.invalid)
    const errors = num(ext.errors)

    fetchRollup24h.sourcePagesFetched += pages
    fetchRollup24h.configsProcessed += processed
    fetchRollup24h.listingsDiscovered += fetched
    fetchRollup24h.listingsInserted += inserted
    fetchRollup24h.listingsSkipped += skipped
    fetchRollup24h.parserInvalid += invalid
    fetchRollup24h.fetchErrors += errors
    fetchRollup24h.fetchDenominator += processed > 0 ? processed : pages > 0 ? 1 : 0

    if (ext.budgetExit === true) {
      fetchRollup24h.budgetExitCount += 1
    }
    if (typeof ext.externalFetchDurationMs === 'number' && ext.externalFetchDurationMs > 0) {
      fetchRollup24h.externalFetchDurationMsSum += ext.externalFetchDurationMs
      fetchRollup24h.externalFetchDurationSampleCount += 1
    }

    const agg = ext.dedupeTelemetrySummary
    fetchRollup24h.duplicateSkips += dedupeSkipCountFromAggregate(agg)
    fetchRollup24h.dedupeDenominator += dedupeDenominatorFromAggregate(agg)

    if (fetchHourly.has(k)) {
      fetchHourly.set(k, (fetchHourly.get(k) ?? 0) + pages)
      configsProcessedHourly.set(k, (configsProcessedHourly.get(k) ?? 0) + processed)
      insertedHourly.set(k, (insertedHourly.get(k) ?? 0) + inserted)
      listingsSkippedHourly.set(k, (listingsSkippedHourly.get(k) ?? 0) + skipped)
      listingsDiscoveredHourly.set(k, (listingsDiscoveredHourly.get(k) ?? 0) + fetched)
    }

    if (in24h) {
      geocodeRollup24h.succeeded += row.geocode_succeeded_count
      geocodeRollup24h.retryableFailed += row.failed_retriable_count
      geocodeRollup24h.terminalFailed += row.failed_terminal_count
      geocodeRollup24h.rate429 += row.rate_429_count
      geocodeRollup24h.claimed += row.claimed_count

      publishRollup24h.attempted += row.publish_attempted_count
      publishRollup24h.succeeded += row.publish_succeeded_count
      publishRollup24h.failed += row.publish_failed_count
      publishRollup24h.skipped += row.publish_skipped_count
      publishRollup24h.duplicateReuse += num(ext.publishDuplicateReuseCount)
    }
  }

  return {
    fetchHourly,
    configsProcessedHourly,
    insertedHourly,
    listingsSkippedHourly,
    listingsDiscoveredHourly,
    geocodeSuccessHourly,
    geocodeRetryableHourly,
    geocodeTerminalHourly,
    rate429Hourly,
    publishAttemptedHourly,
    publishSuccessHourly,
    publishFailedHourly,
    publishExpiredHourly,
    claimedHourly,
    durationSumByHour,
    durationCountByHour,
    fetchRollup24h,
    geocodeRollup24h,
    publishRollup24h,
    reconciliationRollup24h,
    discoveryRollup24h,
    latestGeocodeConcurrency,
    lockSkippedRuns48h,
    budgetExitRuns48h,
    overlapPreventionEvents48h,
    latestExternalNote,
  }
}

export function classifyIngestionBottleneck(params: {
  needsGeocodeCount: number
  readyCount: number
  oldestNeedsGeocodeAgeMs: number | null
  oldestReadyAgeMs: number | null
  geocodeStaleCriticalMs: number
  publishStaleCriticalMs: number
  fetchOverdueCount: number
  rate429Last24h: number
  geocodeRetryableLast24h: number
  fetchBudgetExitLast24h: number
}): IngestionBottleneck {
  if (params.rate429Last24h >= 10 || params.geocodeRetryableLast24h >= 50) {
    return 'db_provider_pressure'
  }
  if (params.oldestNeedsGeocodeAgeMs != null && params.oldestNeedsGeocodeAgeMs >= params.geocodeStaleCriticalMs) {
    return 'geocode'
  }
  if (
    params.needsGeocodeCount >= 100 &&
    (params.oldestNeedsGeocodeAgeMs ?? 0) >= params.geocodeStaleCriticalMs / 2
  ) {
    return 'geocode'
  }
  if (params.oldestReadyAgeMs != null && params.oldestReadyAgeMs >= params.publishStaleCriticalMs) {
    return 'publish'
  }
  if (params.readyCount >= 50 && (params.oldestReadyAgeMs ?? 0) >= params.publishStaleCriticalMs / 2) {
    return 'publish'
  }
  if (params.fetchOverdueCount > 0 || params.fetchBudgetExitLast24h >= 3) {
    return 'fetch'
  }
  if (params.needsGeocodeCount === 0 && params.readyCount === 0 && params.fetchOverdueCount === 0) {
    return 'none'
  }
  if (params.needsGeocodeCount >= params.readyCount && params.needsGeocodeCount > 0) {
    return 'geocode'
  }
  if (params.readyCount > 0) {
    return 'publish'
  }
  return 'none'
}

export function oldestAgeMsFromTimestamp(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, nowMs - ms)
}

/** Strip URL-bearing fields from admin stuck-row samples. */
export function sanitizeStuckRowSample(row: {
  id: string
  status: string
  city: string | null
  state: string | null
  geocode_attempts: number | null
  created_at: string
  updated_at: string
  last_geocode_attempt_at: string | null
  source_url?: string
}): {
  id: string
  status: string
  city: string | null
  state: string | null
  geocode_attempts: number | null
  created_at: string
  updated_at: string
  last_geocode_attempt_at: string | null
} {
  return {
    id: row.id,
    status: row.status,
    city: row.city,
    state: row.state,
    geocode_attempts: row.geocode_attempts,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_geocode_attempt_at: row.last_geocode_attempt_at,
  }
}

export function responseContainsRawUrl(value: unknown): boolean {
  const s = JSON.stringify(value)
  return /https?:\/\//i.test(s)
}
