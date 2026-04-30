import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { runGeocodeQueueWorker, sweepNeedsGeocodeToQueue } from '@/lib/ingestion/geocodeQueue'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handle(request: NextRequest) {
  try {
    assertCronAuthorized(request)
    const sweep = await sweepNeedsGeocodeToQueue(200)
    const queue = await runGeocodeQueueWorker()
    return NextResponse.json({
      ok: true,
      task: 'geocode_queue',
      sweep,
      queue,
    })
  } catch (error) {
    logger.error('Geocode queue cron failed', error instanceof Error ? error : new Error(String(error)), {
      component: 'api/cron/geocode',
    })
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json(
      { ok: false, task: 'geocode_queue', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
