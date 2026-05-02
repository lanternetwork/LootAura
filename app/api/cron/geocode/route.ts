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
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

const DEFAULT_QUEUE_BATCH = 25
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
  try {
    assertCronAuthorized(request)
  } catch (error) {
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
  } catch (error) {
    errors = 1
    logger.error(
      'Geocode queue cron batch failed',
      error instanceof Error ? error : new Error(String(error)),
      { component: 'api/cron/geocode', operation: 'processGeocodeQueueBatch', limit }
    )
    return NextResponse.json(
      {
        ok: false,
        processed,
        requeued,
        completed,
        errors,
        limit,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    processed,
    requeued,
    completed,
    errors,
    limit,
  })
}
