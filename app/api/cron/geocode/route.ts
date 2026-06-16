/**
 * GET /api/cron/geocode
 * POST /api/cron/geocode
 *
 * Deterministic cron-only geocode drain (no public/request-path triggers):
 * 1. Acquire shared `geocode_pipeline` lease (skips when daily cron holds overlap).
 * 2. One bounded batch from the Redis-backed job queue (`processGeocodeQueueBatch`).
 * 3. One bounded DB backlog batch via `geocodePendingSales`.
 * 4. Bounded transient dead-letter replay (`needs_check` → `needs_geocode`) when 429 pressure is low.
 *
 * Backlog batch size: `GEOCODE_BACKLOG_BATCH_SIZE` (default 15, hard cap 100).
 * Response JSON includes `queue`, `backlog`, `replay`, and lease metadata.
 *
 * Preview: workflow `.github/workflows/preview-post-deploy-geocode-cron.yml` calls this
 * route on the live URL after Vercel `repository_dispatch` (or legacy `deployment_status`).
 *
 * Protected by CRON_SECRET Bearer authentication (same pattern as other cron routes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { logger, generateOperationId } from '@/lib/log'
import { recordGeocodeCronOrchestrationRun } from '@/lib/ingestion/orchestrationMetrics'
import { adaptiveNoteToOrchestrationPayload } from '@/lib/ingestion/adaptiveThroughputProfile'
import { resolveAdaptiveThroughputForCron } from '@/lib/ingestion/adaptiveThroughputSignals'
import { createCorrelationBundle } from '@/lib/observability/correlation'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { runWithGeocodePipelineLease } from '@/lib/ingestion/geocodePipelineLease'
import { runGeocodeCronPipeline } from '@/lib/ingestion/geocodeCronPipeline'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return handleGeocodeCron(request)
}

export async function POST(request: NextRequest) {
  return handleGeocodeCron(request)
}

async function handleGeocodeCron(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = generateOperationId()
  const correlation = createCorrelationBundle({ requestId, operationId: requestId, jobType: 'cron.geocode' })
  const telemetryContext = {
    requestId: correlation.requestId,
    operationId: correlation.operationId,
    correlationId: correlation.correlationId,
    jobType: 'cron.geocode',
  }
  const environment = process.env.NODE_ENV || 'development'
  const deploymentEnv = process.env.VERCEL_ENV || 'unknown'

  logger.info('Geocode cron route hit', {
    component: 'api/cron/geocode',
    operation: 'route_hit',
    requestId,
    method: request.method,
    route: request.nextUrl.pathname,
    search: request.nextUrl.search,
    environment,
    deploymentEnv,
  })

  try {
    assertCronAuthorized(request)
  } catch (error) {
    logger.warn('Geocode cron exited early due to auth failure', {
      component: 'api/cron/geocode',
      operation: 'auth_failed_early_exit',
      requestId,
      environment,
      deploymentEnv,
      durationMs: Date.now() - startedAt,
    })
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.api.cronGeocodeHit, {
        ...telemetryContext,
        phase: 'auth_failed',
        durationMs: Date.now() - startedAt,
      })
    )
    if (error instanceof NextResponse) {
      return error
    }
    throw error
  }

  const { envelope: adaptiveEnvelope, note: adaptiveNote } = await resolveAdaptiveThroughputForCron()
  const adaptivePayload = adaptiveNoteToOrchestrationPayload(adaptiveNote)
  const limit = adaptiveEnvelope.geocode.queueBatchSize
  const backlogBatchSize = adaptiveEnvelope.geocode.backlogBatchSize

  try {
    const leaseRun = await runWithGeocodePipelineLease({
    logContext: {
      component: 'api/cron/geocode',
      requestId,
      environment,
      deploymentEnv,
    },
    execute: () =>
      runGeocodeCronPipeline({
        queueBatchSize: limit,
        backlogBatchSize,
        concurrencyCeiling: adaptiveEnvelope.geocode.concurrencyCeiling,
        telemetryContext,
      }),
    })

    if (leaseRun.skipped) {
    const durationMs = Date.now() - startedAt
    logger.info('Geocode cron skipped due to active pipeline lease', {
      component: 'api/cron/geocode',
      operation: 'lease_skipped',
      requestId,
      reason: leaseRun.reason,
      durationMs,
    })
    await recordGeocodeCronOrchestrationRun({
      durationMs,
      backlogClaimed: 0,
      queueProcessed: 0,
      queueCompleted: 0,
      queueRequeued: 0,
      rate429Count: 0,
      ok: true,
      adaptiveNote: adaptivePayload,
      effectiveGeocodeQueueBatch: limit,
      effectiveGeocodeConcurrency: adaptiveEnvelope.geocode.concurrencyCeiling,
    })
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.api.cronGeocodeHit, {
        ...telemetryContext,
        phase: 'lease_skipped',
        ok: true,
        leaseReason: leaseRun.reason,
        durationMs,
      })
    )
    return NextResponse.json({
      ok: true,
      skipped: true,
      skip_reason: leaseRun.reason,
      environment,
      deployment_environment: deploymentEnv,
      duration_ms: durationMs,
    })
  }

    const pipeline = leaseRun.result
    const durationMs = Date.now() - startedAt
    const { nativeCoord, queue, backlog, replay } = pipeline

    if (queue.processed === 0) {
      logger.warn('Geocode cron processed zero queue rows', {
        component: 'api/cron/geocode',
        operation: 'queue_empty',
        requestId,
        limit,
        environment,
        deploymentEnv,
      })
    }
    if (backlog.claimed === 0) {
      logger.warn('Geocode cron backlog drain claimed zero rows', {
        component: 'api/cron/geocode',
        operation: 'backlog_empty',
        requestId,
        backlogBatchSize,
        environment,
        deploymentEnv,
      })
    }

    await recordGeocodeCronOrchestrationRun({
      durationMs,
      backlogClaimed: backlog.claimed,
      queueProcessed: queue.processed,
      queueCompleted: queue.completed,
      queueRequeued: queue.requeued,
      rate429Count: backlog.rate429Count,
      ok: true,
      adaptiveNote: adaptivePayload,
      effectiveGeocodeQueueBatch: limit,
      effectiveGeocodeConcurrency: adaptiveEnvelope.geocode.concurrencyCeiling,
    })

    logger.info('Geocode cron completed', {
      component: 'api/cron/geocode',
      operation: 'cron_complete',
      requestId,
      environment,
      deploymentEnv,
      durationMs,
      limit,
      processed: queue.processed,
      completed: queue.completed,
      requeued: queue.requeued,
      backlogBatchSize,
      backlogClaimed: backlog.claimed,
      backlogProcessed: backlog.processed,
      backlogFailed: backlog.failed,
      backlogPublishTriggered: backlog.publishTriggered,
      backlogDurationMs: backlog.duration_ms,
      replayReplayed: replay.replayed,
      replaySkipped429: replay.skippedDueTo429Pressure === true,
    })

    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.api.cronGeocodeHit, {
        ...telemetryContext,
        phase: 'complete',
        ok: true,
        environment,
        deploymentEnv,
        durationMs,
        queueProcessed: queue.processed,
        queueCompleted: queue.completed,
        queueRequeued: queue.requeued,
        backlogClaimed: backlog.claimed,
        backlogProcessed: backlog.processed,
        backlogFailed: backlog.failed,
        backlogPublishTriggered: backlog.publishTriggered,
        replayReplayed: replay.replayed,
      })
    )

    return NextResponse.json({
      ok: true,
      skipped: false,
      environment,
      deployment_environment: deploymentEnv,
      duration_ms: durationMs,
      claimed: queue.processed,
      processed: queue.processed,
      failed: 0,
      requeued: queue.requeued,
      completed: queue.completed,
      errors: 0,
      limit,
      native_coord: nativeCoord,
      queue,
      backlog: {
        batch_size: backlog.batch_size,
        claimed: backlog.claimed,
        processed: backlog.processed,
        failed: backlog.failed,
        publishTriggered: backlog.publishTriggered,
        duration_ms: backlog.duration_ms,
        error: backlog.error,
      },
      replay: {
        attempted: replay.attempted,
        eligible: replay.eligible,
        replayed: replay.replayed,
        skipped: replay.skipped,
        updateErrors: replay.updateErrors,
        lostRaces: replay.lostRaces,
        skipped_due_to_429_pressure: replay.skippedDueTo429Pressure === true,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startedAt
    logger.error('Geocode cron pipeline failed', error instanceof Error ? error : new Error(message), {
      component: 'api/cron/geocode',
      operation: 'pipeline_failed',
      requestId,
      environment,
      deploymentEnv,
    })
    await recordGeocodeCronOrchestrationRun({
      durationMs,
      backlogClaimed: 0,
      queueProcessed: 0,
      queueCompleted: 0,
      queueRequeued: 0,
      rate429Count: 0,
      ok: false,
      error: message,
      adaptiveNote: adaptivePayload,
      effectiveGeocodeQueueBatch: limit,
      effectiveGeocodeConcurrency: adaptiveEnvelope.geocode.concurrencyCeiling,
    })
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.api.cronGeocodeHit, {
        ...telemetryContext,
        phase: 'pipeline_error',
        ok: false,
        environment,
        deploymentEnv,
        durationMs,
        error: message,
      })
    )
    return NextResponse.json(
      {
        ok: false,
        environment,
        deployment_environment: deploymentEnv,
        duration_ms: durationMs,
        error: message,
      },
      { status: 500 }
    )
  }
}
