import { NextResponse } from 'next/server'

/**
 * Deprecated endpoint.
 *
 * Archiving is handled solely by app/api/cron/daily/route.ts.
 * This endpoint remains to avoid 404s from stale cron configs but
 * returns 410 Gone to signal decommissioning.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { ok: false, deprecated: true, message: 'Use /api/cron/daily for archiving' },
    { status: 410 }
  )
}

export async function POST() {
  return NextResponse.json(
    { ok: false, deprecated: true, message: 'Use /api/cron/daily for archiving' },
    { status: 410 }
  )
}

