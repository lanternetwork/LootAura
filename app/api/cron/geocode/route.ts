/**
 * GET /api/cron/geocode
 * POST /api/cron/geocode
 *
 * Drains the Redis-backed geocode job queue for one bounded batch (spec §10).
 * Protected by CRON_SECRET Bearer authentication (same pattern as other cron routes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { processGeocodeQueueBatch } from '@/lib/ingestion/geocodeQueue'
import { logger, generateOperationId } from '@/lib/log'

export const dynamic = 'force-dynamic'

const DEFAULT_QUEUE_BATCH = 50
const MAX_QUEUE_BATCH = 100

function parseQueueBatchLimit(): number {
  const raw = process.env.GEOCODE_CRON_QUEUE_BATCH
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_QUEUE_BATCH
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUEUE_BATCH
  }
  return Math.min(parsed, MAX_QUEUE_BATCH)
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
  let processed = 0
  let requeued = 0
  let completed = 0
  let errors = 0

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
  })
}
