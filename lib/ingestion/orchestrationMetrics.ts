import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import type { GeocodeWorkerSummary } from '@/lib/ingestion/geocodeWorker'
import type { PublishWorkerBatchSummary } from '@/lib/ingestion/publishWorker'

export type OrchestrationMode = 'daily' | 'ingestion'

function parseGeocodeBatchSizeForMetrics(): number {
  const raw = process.env.GEOCODE_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : 100
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100
  }
  return Math.min(parsed, 500)
}

function parseGeocodeConcurrencyForMetrics(): number {
  const raw = process.env.GEOCODE_CONCURRENCY
  const defaultConcurrency = 2
  if (raw === undefined || raw === '') {
    return defaultConcurrency
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultConcurrency
  }
  return Math.min(parsed, 3)
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
}

export async function recordIngestionOrchestrationRun(params: {
  mode: OrchestrationMode
  orchestrationGeoPublishDurationMs: number
  geocodeSummary: GeocodeWorkerSummary | null
  publishSummary: PublishWorkerBatchSummary | null
}): Promise<void> {
  const geocode = params.geocodeSummary ?? emptyGeocode
  const publish = params.publishSummary ?? emptyPublish

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
      publish_skipped_count: publish.skipped,
      duration_ms: params.orchestrationGeoPublishDurationMs,
      rate_429_count: geocode.rate429Count,
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
