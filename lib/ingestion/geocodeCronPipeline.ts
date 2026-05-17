import { processGeocodeQueueBatch } from '@/lib/ingestion/geocodeQueue'
import { geocodePendingSales } from '@/lib/ingestion/geocodeWorker'
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
