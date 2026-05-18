import { processGeocodeQueueBatch } from '@/lib/ingestion/geocodeQueue'
import { geocodePendingSales } from '@/lib/ingestion/geocodeWorker'
import {
  runNativeCoordinateRemediation,
  type NativeCoordinateRemediationSummary,
} from '@/lib/ingestion/nativeCoordinateRemediationWorker'
import {
  parseGeocodeCronReplayLimitFromEnv,
  runBoundedGeocodeDeadLetterReplay,
  type GeocodeDeadLetterReplayRunResult,
} from '@/lib/geocode/geocodeDeadLetterReplay'
import { logger } from '@/lib/log'

export function parseGeocodeCronReplayMax429FromEnv(): number {
  const raw = process.env.GEOCODE_CRON_REPLAY_MAX_429
  const defaultMax = 5
  if (raw === undefined || raw === '') return defaultMax
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMax
  return Math.min(parsed, 50)
}

export type GeocodeCronPipelineResult = {
  nativeCoord: NativeCoordinateRemediationSummary & { duration_ms: number; error: string | null }
  queue: {
    processed: number
    completed: number
    requeued: number
    failed: number
  }
  backlog: {
    batch_size: number
    claimed: number
    processed: number
    failed: number
    publishTriggered: number
    duration_ms: number
    error: string | null
    rate429Count: number
  }
  replay: GeocodeDeadLetterReplayRunResult & { skippedDueTo429Pressure?: boolean }
}

export async function runGeocodeCronPipeline(params: {
  queueBatchSize: number
  backlogBatchSize: number
  concurrencyCeiling: number
  telemetryContext: Record<string, unknown>
}): Promise<GeocodeCronPipelineResult> {
  const nativeStartedAt = Date.now()
  let nativeCoord: GeocodeCronPipelineResult['nativeCoord'] = {
    claimed: 0,
    promoted: 0,
    cacheHits: 0,
    retryScheduled: 0,
    fallbackToGeocode: 0,
    terminal: 0,
    skipped: 0,
    fetchFailed: 0,
    publishFailed: 0,
    duration_ms: 0,
    error: null,
  }
  try {
    const summary = await runNativeCoordinateRemediation({
      batchSizeOverride: params.backlogBatchSize,
      telemetryContext: {
        ...params.telemetryContext,
        jobType: 'cron.geocode.native_coord',
      },
    })
    nativeCoord = { ...summary, duration_ms: Date.now() - nativeStartedAt, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      'Native coordinate remediation failed; continuing geocode pipeline',
      error instanceof Error ? error : new Error(message),
      {
        component: 'ingestion/geocodeCronPipeline',
        operation: 'native_coord_remediation',
        ...params.telemetryContext,
      }
    )
    nativeCoord = {
      ...nativeCoord,
      duration_ms: Date.now() - nativeStartedAt,
      error: message,
    }
  }

  const batch = await processGeocodeQueueBatch(params.queueBatchSize, {
    telemetryContext: params.telemetryContext,
  })

  const backlogStartedAt = Date.now()
  const backlog = await geocodePendingSales({
    batchSizeOverride: params.backlogBatchSize,
    concurrencyCeilingOverride: params.concurrencyCeiling,
    captureClaimedRowIds: true,
    telemetryContext: params.telemetryContext,
  })
  const backlogDurationMs = Date.now() - backlogStartedAt
  const backlogRate429Count = Number(backlog.rate429Count ?? 0)
  const backlogProcessed =
    backlog.processed ??
    (Number(backlog.succeeded ?? 0) + Number(backlog.failedRetriable ?? 0) + Number(backlog.failedTerminal ?? 0))
  const backlogFailed = Number(backlog.failedRetriable ?? 0) + Number(backlog.failedTerminal ?? 0)

  const replayMax429 = parseGeocodeCronReplayMax429FromEnv()
  let replay: GeocodeCronPipelineResult['replay']
  if (backlogRate429Count > replayMax429) {
    logger.info('Geocode cron skipping dead-letter replay due to 429 pressure', {
      component: 'api/cron/geocode',
      operation: 'replay_skipped_429',
      backlogRate429Count,
      replayMax429,
    })
    replay = {
      attempted: 0,
      eligible: 0,
      replayed: 0,
      skipped: 0,
      updateErrors: 0,
      lostRaces: 0,
      skippedDueTo429Pressure: true,
    }
  } else {
    replay = {
      ...(await runBoundedGeocodeDeadLetterReplay({
        limit: parseGeocodeCronReplayLimitFromEnv(),
        requireTransientProvider: true,
        requireNullCoordinates: true,
        telemetryContext: {
          ...params.telemetryContext,
          jobType: 'cron.geocode.dead_letter_replay',
        },
      })),
      skippedDueTo429Pressure: false,
    }
  }

  return {
    nativeCoord,
    queue: {
      processed: batch.dequeued,
      completed: batch.completed,
      requeued: batch.requeued,
      failed: 0,
    },
    backlog: {
      batch_size: params.backlogBatchSize,
      claimed: backlog.claimed,
      processed: backlogProcessed,
      failed: backlogFailed,
      publishTriggered: Number(backlog.publishTriggered ?? 0),
      duration_ms: backlogDurationMs,
      error: null,
      rate429Count: backlogRate429Count,
    },
    replay,
  }
}
