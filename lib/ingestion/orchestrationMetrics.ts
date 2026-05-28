import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import type { DedupeDecisionAggregate } from '@/lib/ingestion/dedupe'
import type { GeocodeWorkerSummary } from '@/lib/ingestion/geocodeWorker'
import type { PublishWorkerBatchSummary } from '@/lib/ingestion/publishWorker'

export type OrchestrationMode = 'daily' | 'ingestion'

function parseGeocodeBatchSizeForMetrics(): number {
  const raw = process.env.GEOCODE_BATCH_SIZE
  const defaultBatch = 300
  const parsed = raw ? Number.parseInt(raw, 10) : defaultBatch
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultBatch
  }
  return Math.min(parsed, 500)
}

function parseGeocodeConcurrencyForMetrics(): number {
  const raw = process.env.GEOCODE_CONCURRENCY
  const defaultConcurrency = 4
  if (raw === undefined || raw === '') {
    return defaultConcurrency
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultConcurrency
  }
  return Math.min(parsed, 5)
}

function parseGeocodeCronQueueBatchForMetrics(): number {
  const raw = process.env.GEOCODE_CRON_QUEUE_BATCH
  const defaultBatch = 50
  const maxBatch = 100
  const parsed = raw ? Number.parseInt(raw, 10) : defaultBatch
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultBatch
  }
  return Math.min(parsed, maxBatch)
}

export type ExternalIngestionOrchestrationNote = {
  status: 'completed' | 'skipped_throttle' | 'skipped_lock_active' | 'failed'
  completedAt?: string
  reason?: string
  minIntervalMinutes?: number
  lastSuccessfulExternalIngestionAt?: string
  configsProcessed?: number
  /** Crawlable configs (enabled external_page_source with ≥1 HTTPS source page). */
  configsCrawlable?: number
  /** Enabled external configs skipped at load time (empty source_pages). */
  configsSkippedNoSourcePages?: number
  /** Enabled external configs skipped at load time (source_pages present but no valid HTTPS URL). */
  configsSkippedInvalidUrls?: number
  /** Enabled external configs excluded from crawl rotation (discovery placeholder remediation). */
  configsSkippedCrawlExcluded?: number
  /** Config slots advanced this run (cursor); crawlable configs only. */
  configsConsumed?: number
  /** Processing-time skip when normalizeSourcePages returns empty despite load-time crawlable filter. */
  configsSkippedInvalidPages?: number
  /** Unexamined slots remaining in the bounded slice for this invocation (e.g. budget exit). */
  configsRemaining?: number
  budgetExit?: boolean
  overlapPrevented?: boolean
  staleLockRecovered?: boolean
  lockSkipped?: boolean
  pagesProcessed?: number
  fetched?: number
  inserted?: number
  skipped?: number
  invalid?: number
  errors?: number
  /** Listings skipped at crawl — sale window already ended (Phase 3A). */
  skippedExpired?: number
  /** Non-expired inserts from this run. */
  freshInserted?: number
  duplicateExistingUrl?: number
  duplicateCrossCityPage?: number
  duplicateCanonicalCollision?: number
  duplicateExpiredRow?: number
  /** Phase 2: classified crawl skip sub-reasons (benign vs suspicious). */
  crawlSkipSubReasons?: Record<string, number>
  crawlSkipSuspicious?: number
  crawlSkipBenign?: number
  crawlSkipSubReasonTotal?: number
  ystmDetailFirstAttempted?: number
  ystmDetailFirstSucceeded?: number
  ystmDetailFirstPublished?: number
  ystmDetailFirstFallback?: number
  ystmDetailFirstFetchFailed?: number
  ystmDetailFirstFallbackByReason?: Record<string, number>
  ystmDetailFirstInsertFailedByDbCode?: Record<string, number>
  ystmDetailFirstTopFallbackReason?: string | null
  ystmDetailFirstTopFallbackReasonPct?: number | null
  freshInsertReadyAtInsertRate?: number | null
  medianMsToPublished?: number | null
  /** Detail-first attempts where validated address came from `#address` / detail parser. */
  detailFirstAddressFromDetailPage?: number
  /** Detail-first attempts where validated address fell back to list seed. */
  detailFirstAddressFromListSeed?: number
  /** detailFirstAddressFromDetailPage / ystmDetailFirstAttempted when attempted > 0. */
  detailFirstAddressFromDetailPageRate?: number | null
  dedupeTelemetrySummary?: DedupeDecisionAggregate
  externalFetchDurationMs?: number
  publishDuplicateReuseCount?: number
  adaptive?: Record<string, unknown>
  laneKey?: string
  laneType?: string
  laneRegion?: string | null
  laneConfigsCrawlable?: number
  laneConfigsProcessed?: number
  laneConfigsRemaining?: number
  laneCursorBefore?: number
  laneCursorAfter?: number
  laneOverlapPrevented?: boolean
  laneStaleLockRecovered?: boolean
  laneAdaptiveProfile?: string
}

export type DiscoveryCronOrchestrationNote = {
  ok: boolean
  skipped: boolean
  skipReason?: string | null
  degraded?: boolean
  statesScanned?: number
  catalogSize?: number
  stateBatchPlanned?: number
  stateCursorBefore?: number
  stateCursorAfter?: number
  overlapPrevented?: boolean
  graphEnumerationSkippedReason?: string | null
  graphEnumerationThrottled?: boolean
  phasesCompleted?: string[]
  configsPromoted: number
  configsRepaired: number
  configsRevalidated: number
  configsFailed: number
  crawlableConfigCount: number
  failedConfigCount: number
  crawlExcludedConfigCount: number
  candidatePagesDiscovered: number
  candidatePagesValid: number
}

export type ReconciliationCronOrchestrationNote = {
  ok: boolean
  processed: number
  changed: number
  failed: number
  candidatePageRpcOk: boolean
  scheduleMutationInhibited: number
  salesSyncUpdated: number
  schedulesUpdated: number
}

export type GeocodeCronOrchestrationNote = {
  backlog_claimed: number
  queue_processed: number
  queue_completed: number
  queue_requeued: number
  ok: boolean
  error?: string
  adaptive?: Record<string, unknown>
}

type NotesPayload = {
  external_ingestion?: ExternalIngestionOrchestrationNote
  geocode_cron?: GeocodeCronOrchestrationNote
  discovery_cron?: DiscoveryCronOrchestrationNote
  reconciliation_cron?: ReconciliationCronOrchestrationNote
  publish_time_normalization?: PublishWorkerBatchSummary['timeStartNormalization']
  adaptive?: Record<string, unknown>
}

/**
 * Latest successful external_page_source ingestion completion time from orchestration metrics (any mode).
 * Used to throttle frequent `mode=ingestion` cron without slowing geocode/publish.
 * When `laneKey` is set (lane mode), only matches runs for that lane.
 */
export async function fetchLastSuccessfulExternalIngestionAt(laneKey?: string | null): Promise<string | null> {
  try {
    const admin = getAdminDb()
    const { data, error } = await fromBase(admin, 'ingestion_orchestration_runs')
      .select('notes')
      .not('notes', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      logger.warn('fetchLastSuccessfulExternalIngestionAt query failed', {
        component: 'ingestion/orchestrationMetrics',
        operation: 'select_last_ingestion',
        message: error.message,
        laneKey: laneKey ?? null,
      })
      return null
    }
    if (!Array.isArray(data)) {
      return null
    }
    for (const row of data as { notes: unknown }[]) {
      const notes = row.notes as NotesPayload | null
      const ext = notes?.external_ingestion
      if (ext?.status !== 'completed' || typeof ext.completedAt !== 'string' || ext.completedAt.length === 0) {
        continue
      }
      if (laneKey != null && laneKey !== '') {
        const noteLane = ext.laneKey
        if (noteLane !== laneKey) {
          continue
        }
      } else if (typeof ext.laneKey === 'string' && ext.laneKey.length > 0) {
        continue
      }
      return ext.completedAt
    }
    return null
  } catch (err) {
    logger.error(
      'fetchLastSuccessfulExternalIngestionAt threw',
      err instanceof Error ? err : new Error(String(err)),
      { component: 'ingestion/orchestrationMetrics', operation: 'select_last_ingestion' }
    )
    return null
  }
}

const emptyGeocode: GeocodeWorkerSummary = {
  claimed: 0,
  succeeded: 0,
  failedRetriable: 0,
  failedTerminal: 0,
  rate429Count: 0,
}

const emptyPublish: PublishWorkerBatchSummary = {
  attempted: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  expired: 0,
  timeStartNormalization: {
    source_preserved: 0,
    time_start_rounded: 0,
    time_start_missing_defaulted: 0,
    timezone_normalized: 0,
  },
}

export async function recordIngestionOrchestrationRun(params: {
  mode: OrchestrationMode
  orchestrationGeoPublishDurationMs: number
  geocodeSummary: GeocodeWorkerSummary | null
  publishSummary: PublishWorkerBatchSummary | null
  externalIngestion?: ExternalIngestionOrchestrationNote | null
  adaptiveNote?: Record<string, unknown> | null
  effectiveGeocodeBacklogBatch?: number
  effectiveGeocodeConcurrency?: number
}): Promise<void> {
  const geocode = params.geocodeSummary ?? emptyGeocode
  const publish = params.publishSummary ?? emptyPublish
  const notes: NotesPayload | null = (() => {
    if (params.externalIngestion == null && params.adaptiveNote == null && publish.attempted === 0) return null
    const payload: NotesPayload = {}
    if (params.externalIngestion != null) {
      payload.external_ingestion = params.externalIngestion
    }
    if (publish.attempted > 0) {
      payload.publish_time_normalization = publish.timeStartNormalization
    }
    if (params.adaptiveNote != null) {
      payload.adaptive = params.adaptiveNote
    }
    return payload
  })()

  const batchSize =
    typeof params.effectiveGeocodeBacklogBatch === 'number' && params.effectiveGeocodeBacklogBatch > 0
      ? params.effectiveGeocodeBacklogBatch
      : parseGeocodeBatchSizeForMetrics()
  const concurrency =
    typeof params.effectiveGeocodeConcurrency === 'number' && params.effectiveGeocodeConcurrency > 0
      ? params.effectiveGeocodeConcurrency
      : parseGeocodeConcurrencyForMetrics()

  try {
    const admin = getAdminDb()
    const { error } = await fromBase(admin, 'ingestion_orchestration_runs').insert({
      mode: params.mode,
      batch_size: batchSize,
      concurrency,
      claimed_count: geocode.claimed,
      geocode_succeeded_count: geocode.succeeded,
      failed_retriable_count: geocode.failedRetriable,
      failed_terminal_count: geocode.failedTerminal,
      publish_attempted_count: publish.attempted,
      publish_succeeded_count: publish.succeeded,
      publish_failed_count: publish.failed,
      publish_expired_count: publish.expired,
      publish_skipped_count: publish.skipped,
      duration_ms: params.orchestrationGeoPublishDurationMs,
      rate_429_count: geocode.rate429Count,
      notes,
    })
    if (error) {
      logger.error(
        'ingestion_orchestration_runs insert failed',
        new Error(error.message),
        { component: 'ingestion/orchestrationMetrics', operation: 'insert', mode: params.mode }
      )
    }
  } catch (err) {
    logger.error(
      'ingestion_orchestration_runs insert threw',
      err instanceof Error ? err : new Error(String(err)),
      { component: 'ingestion/orchestrationMetrics', operation: 'insert', mode: params.mode }
    )
  }
}

/**
 * One row per `/api/cron/geocode` invocation. Queue/backlog counts live in `notes.geocode_cron`;
 * scalar ingestion columns are zeroed so admin rollups for daily/ingestion runs stay comparable.
 */
export async function recordGeocodeCronOrchestrationRun(params: {
  durationMs: number
  backlogClaimed: number
  queueProcessed: number
  queueCompleted: number
  queueRequeued: number
  rate429Count?: number
  ok: boolean
  error?: string | null
  adaptiveNote?: Record<string, unknown> | null
  effectiveGeocodeQueueBatch?: number
  effectiveGeocodeConcurrency?: number
}): Promise<void> {
  const gcNote: GeocodeCronOrchestrationNote = {
    backlog_claimed: params.backlogClaimed,
    queue_processed: params.queueProcessed,
    queue_completed: params.queueCompleted,
    queue_requeued: params.queueRequeued,
    ok: params.ok,
    ...(params.error ? { error: params.error } : {}),
    ...(params.adaptiveNote ? { adaptive: params.adaptiveNote } : {}),
  }
  const notes: NotesPayload = {
    geocode_cron: gcNote,
    ...(params.adaptiveNote ? { adaptive: params.adaptiveNote } : {}),
  }

  const batchSize =
    typeof params.effectiveGeocodeQueueBatch === 'number' && params.effectiveGeocodeQueueBatch > 0
      ? params.effectiveGeocodeQueueBatch
      : parseGeocodeCronQueueBatchForMetrics()
  const concurrency =
    typeof params.effectiveGeocodeConcurrency === 'number' && params.effectiveGeocodeConcurrency > 0
      ? params.effectiveGeocodeConcurrency
      : parseGeocodeConcurrencyForMetrics()

  try {
    const admin = getAdminDb()
    const { error } = await fromBase(admin, 'ingestion_orchestration_runs').insert({
      mode: 'geocode_cron',
      batch_size: batchSize,
      concurrency,
      claimed_count: 0,
      geocode_succeeded_count: 0,
      failed_retriable_count: 0,
      failed_terminal_count: 0,
      publish_attempted_count: 0,
      publish_succeeded_count: 0,
      publish_failed_count: 0,
      publish_expired_count: 0,
      publish_skipped_count: 0,
      duration_ms: params.durationMs,
      rate_429_count: params.rate429Count ?? 0,
      notes,
    })
    if (error) {
      logger.error(
        'ingestion_orchestration_runs insert failed (geocode_cron)',
        new Error(error.message),
        { component: 'ingestion/orchestrationMetrics', operation: 'insert_geocode_cron' }
      )
    }
  } catch (err) {
    logger.error(
      'ingestion_orchestration_runs insert threw (geocode_cron)',
      err instanceof Error ? err : new Error(String(err)),
      { component: 'ingestion/orchestrationMetrics', operation: 'insert_geocode_cron' }
    )
  }
}

export async function recordDiscoveryCronOrchestrationRun(params: {
  durationMs: number
  note: DiscoveryCronOrchestrationNote
}): Promise<void> {
  const notes: NotesPayload = { discovery_cron: params.note }
  try {
    const admin = getAdminDb()
    const { error } = await fromBase(admin, 'ingestion_orchestration_runs').insert({
      mode: 'discovery_cron',
      batch_size: 0,
      concurrency: 0,
      claimed_count: 0,
      geocode_succeeded_count: 0,
      failed_retriable_count: 0,
      failed_terminal_count: 0,
      publish_attempted_count: 0,
      publish_succeeded_count: 0,
      publish_failed_count: 0,
      publish_expired_count: 0,
      publish_skipped_count: 0,
      duration_ms: params.durationMs,
      rate_429_count: 0,
      notes,
    })
    if (error) {
      logger.error(
        'ingestion_orchestration_runs insert failed (discovery_cron)',
        new Error(error.message),
        { component: 'ingestion/orchestrationMetrics', operation: 'insert_discovery_cron' }
      )
    }
  } catch (err) {
    logger.error(
      'ingestion_orchestration_runs insert threw (discovery_cron)',
      err instanceof Error ? err : new Error(String(err)),
      { component: 'ingestion/orchestrationMetrics', operation: 'insert_discovery_cron' }
    )
  }
}

export async function recordReconciliationCronOrchestrationRun(params: {
  durationMs: number
  note: ReconciliationCronOrchestrationNote
}): Promise<void> {
  const notes: NotesPayload = { reconciliation_cron: params.note }
  try {
    const admin = getAdminDb()
    const { error } = await fromBase(admin, 'ingestion_orchestration_runs').insert({
      mode: 'reconciliation_cron',
      batch_size: 0,
      concurrency: 0,
      claimed_count: 0,
      geocode_succeeded_count: 0,
      failed_retriable_count: 0,
      failed_terminal_count: 0,
      publish_attempted_count: 0,
      publish_succeeded_count: 0,
      publish_failed_count: 0,
      publish_expired_count: 0,
      publish_skipped_count: 0,
      duration_ms: params.durationMs,
      rate_429_count: 0,
      notes,
    })
    if (error) {
      logger.error(
        'ingestion_orchestration_runs insert failed (reconciliation_cron)',
        new Error(error.message),
        { component: 'ingestion/orchestrationMetrics', operation: 'insert_reconciliation_cron' }
      )
    }
  } catch (err) {
    logger.error(
      'ingestion_orchestration_runs insert threw (reconciliation_cron)',
      err instanceof Error ? err : new Error(String(err)),
      { component: 'ingestion/orchestrationMetrics', operation: 'insert_reconciliation_cron' }
    )
  }
}
