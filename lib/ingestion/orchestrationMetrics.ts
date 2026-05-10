import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
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
  /** Config slots advanced this run (cursor); includes invalid/empty configs examined. */
  configsConsumed?: number
  configsSkippedInvalidPages?: number
  /** Unexamined slots remaining in the bounded slice for this invocation (e.g. budget exit). */
  configsRemaining?: number
  budgetExit?: boolean
  overlapPrevented?: boolean
  staleLockRecovered?: boolean
  lockSkipped?: boolean
}

export type GeocodeCronOrchestrationNote = {
  backlog_claimed: number
  queue_processed: number
  queue_completed: number
  queue_requeued: number
  ok: boolean
  error?: string
}

type NotesPayload = {
  external_ingestion?: ExternalIngestionOrchestrationNote
  geocode_cron?: GeocodeCronOrchestrationNote
}

/**
 * Latest successful external_page_source ingestion completion time from orchestration metrics (any mode).
 * Used to throttle frequent `mode=ingestion` cron without slowing geocode/publish.
 */
export async function fetchLastSuccessfulExternalIngestionAt(): Promise<string | null> {
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
      })
      return null
    }
    if (!Array.isArray(data)) {
      return null
    }
    for (const row of data as { notes: unknown }[]) {
      const notes = row.notes as NotesPayload | null
      const ext = notes?.external_ingestion
      if (ext?.status === 'completed' && typeof ext.completedAt === 'string' && ext.completedAt.length > 0) {
        return ext.completedAt
      }
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
}

export async function recordIngestionOrchestrationRun(params: {
  mode: OrchestrationMode
  orchestrationGeoPublishDurationMs: number
  geocodeSummary: GeocodeWorkerSummary | null
  publishSummary: PublishWorkerBatchSummary | null
  externalIngestion?: ExternalIngestionOrchestrationNote | null
}): Promise<void> {
  const geocode = params.geocodeSummary ?? emptyGeocode
  const publish = params.publishSummary ?? emptyPublish
  const notes: NotesPayload | null =
    params.externalIngestion != null
      ? { external_ingestion: params.externalIngestion }
      : null

  try {
    const admin = getAdminDb()
    const { error } = await fromBase(admin, 'ingestion_orchestration_runs').insert({
      mode: params.mode,
      batch_size: parseGeocodeBatchSizeForMetrics(),
      concurrency: parseGeocodeConcurrencyForMetrics(),
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
}): Promise<void> {
  const gcNote: GeocodeCronOrchestrationNote = {
    backlog_claimed: params.backlogClaimed,
    queue_processed: params.queueProcessed,
    queue_completed: params.queueCompleted,
    queue_requeued: params.queueRequeued,
    ok: params.ok,
    ...(params.error ? { error: params.error } : {}),
  }
  const notes: NotesPayload = { geocode_cron: gcNote }

  try {
    const admin = getAdminDb()
    const { error } = await fromBase(admin, 'ingestion_orchestration_runs').insert({
      mode: 'geocode_cron',
      batch_size: parseGeocodeCronQueueBatchForMetrics(),
      concurrency: parseGeocodeConcurrencyForMetrics(),
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
