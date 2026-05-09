/**
 * GET /api/cron/geocode
 * POST /api/cron/geocode
 *
 * Deterministic cron-only geocode drain (no public/request-path triggers):
 * 1. One bounded batch from the Redis-backed job queue (`processGeocodeQueueBatch`).
 * 2. One bounded DB backlog batch via `geocodePendingSales({ batchSizeOverride, captureClaimedRowIds: true })`.
 *
 * Backlog batch size: `GEOCODE_BACKLOG_BATCH_SIZE` (default 25, hard cap 100).
 * Response JSON includes `queue` and `backlog` metrics.
 *
 * Preview: workflow `.github/workflows/preview-post-deploy-geocode-cron.yml` calls this
 * route on the live URL after Vercel `repository_dispatch` (or legacy `deployment_status`).
 *
 * Protected by CRON_SECRET Bearer authentication (same pattern as other cron routes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { processGeocodeQueueBatch } from '@/lib/ingestion/geocodeQueue'
import { geocodePendingSales } from '@/lib/ingestion/geocodeWorker'
import { logger, generateOperationId } from '@/lib/log'

export const dynamic = 'force-dynamic'

const DEFAULT_QUEUE_BATCH = 50
const MAX_QUEUE_BATCH = 100
const DEFAULT_BACKLOG_BATCH = 25
const MAX_BACKLOG_BATCH = 100

function parseQueueBatchLimit(): number {
  const raw = process.env.GEOCODE_CRON_QUEUE_BATCH
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_QUEUE_BATCH
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUEUE_BATCH
  }
  return Math.min(parsed, MAX_QUEUE_BATCH)
}

function parseBacklogBatchLimit(): number {
  const raw = process.env.GEOCODE_BACKLOG_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_BACKLOG_BATCH
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BACKLOG_BATCH
  }
  return Math.min(parsed, MAX_BACKLOG_BATCH)
}

export async function GET(request: NextRequest) {
  return handleGeocodeCron(request)
}

export async function POST(request: NextRequest) {
  return handleGeocodeCron(request)
}

async function handleGeocodeCron(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = generateOperationId()
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
    if (error instanceof NextResponse) {
      return error
    }
    throw error
  }

  const limit = parseQueueBatchLimit()
  const backlogBatchSize = parseBacklogBatchLimit()
  let processed = 0
  let requeued = 0
  let completed = 0
  let errors = 0
  let backlogClaimed = 0
  let backlogProcessed = 0
  let backlogFailed = 0
  let backlogPublishTriggered = 0
  let backlogDurationMs = 0
  let backlogError: string | null = null

  try {
    const batch = await processGeocodeQueueBatch(limit)
    processed = batch.dequeued
    requeued = batch.requeued
    completed = batch.completed
    if (processed === 0) {
      logger.warn('Geocode cron processed zero queue rows', {
        component: 'api/cron/geocode',
        operation: 'queue_empty',
        requestId,
        limit,
        environment,
        deploymentEnv,
      })
    }

    const backlogStartedAt = Date.now()
    try {
      const backlog = await geocodePendingSales({
        batchSizeOverride: backlogBatchSize,
        captureClaimedRowIds: true,
      })
      backlogDurationMs = Date.now() - backlogStartedAt
      backlogClaimed = backlog.claimed
      backlogProcessed =
        backlog.processed ??
        (Number(backlog.succeeded ?? 0) + Number(backlog.failedRetriable ?? 0) + Number(backlog.failedTerminal ?? 0))
      backlogFailed = Number(backlog.failedRetriable ?? 0) + Number(backlog.failedTerminal ?? 0)
      backlogPublishTriggered = Number(backlog.publishTriggered ?? 0)
      if (backlogClaimed === 0) {
        logger.warn('Geocode cron backlog drain claimed zero rows', {
          component: 'api/cron/geocode',
          operation: 'backlog_empty',
          requestId,
          backlogBatchSize,
          environment,
          deploymentEnv,
        })
      }
    } catch (error) {
      backlogDurationMs = Date.now() - backlogStartedAt
      backlogError = error instanceof Error ? error.message : String(error)
      logger.error(
        'Geocode cron backlog drain failed',
        error instanceof Error ? error : new Error(backlogError),
        {
          component: 'api/cron/geocode',
          operation: 'backlog_drain',
          requestId,
          backlogBatchSize,
          environment,
          deploymentEnv,
        }
      )
      errors = 1
      const durationMs = Date.now() - startedAt
      return NextResponse.json(
        {
          ok: false,
          environment,
          deployment_environment: deploymentEnv,
          duration_ms: durationMs,
          claimed: processed,
          processed,
          failed: errors,
          requeued,
          completed,
          errors,
          limit,
          queue: {
            processed,
            completed,
            requeued,
            failed: 0,
          },
          backlog: {
            batch_size: backlogBatchSize,
            claimed: backlogClaimed,
            processed: backlogProcessed,
            failed: backlogFailed,
            publishTriggered: backlogPublishTriggered,
            duration_ms: backlogDurationMs,
            error: backlogError,
          },
          error: backlogError,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    errors = 1
    logger.error(
      'Geocode queue cron batch failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'api/cron/geocode',
        operation: 'processGeocodeQueueBatch',
        requestId,
        limit,
        environment,
        deploymentEnv,
      }
    )
    const durationMs = Date.now() - startedAt
    return NextResponse.json(
      {
        ok: false,
        environment,
        deployment_environment: deploymentEnv,
        duration_ms: durationMs,
        claimed: processed,
        processed,
        failed: errors,
        requeued,
        completed,
        errors,
        limit,
        queue: {
          processed,
          completed,
          requeued,
          failed: errors,
        },
        backlog: {
          batch_size: backlogBatchSize,
          claimed: backlogClaimed,
          processed: backlogProcessed,
          failed: backlogFailed,
          publishTriggered: backlogPublishTriggered,
          duration_ms: backlogDurationMs,
          error: backlogError,
        },
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }

  const durationMs = Date.now() - startedAt
  logger.info('Geocode cron completed', {
    component: 'api/cron/geocode',
    operation: 'cron_complete',
    requestId,
    environment,
    deploymentEnv,
    durationMs,
    limit,
    processed,
    completed,
    requeued,
    failed: errors,
    backlogBatchSize,
    backlogClaimed,
    backlogProcessed,
    backlogFailed,
    backlogPublishTriggered,
    backlogDurationMs,
  })

  return NextResponse.json({
    ok: true,
    environment,
    deployment_environment: deploymentEnv,
    duration_ms: durationMs,
    claimed: processed,
    processed,
    failed: errors,
    requeued,
    completed,
    errors,
    limit,
    queue: {
      processed,
      completed,
      requeued,
      failed: 0,
    },
    backlog: {
      batch_size: backlogBatchSize,
      claimed: backlogClaimed,
      processed: backlogProcessed,
      failed: backlogFailed,
      publishTriggered: backlogPublishTriggered,
      duration_ms: backlogDurationMs,
      error: backlogError,
    },
  })
}
