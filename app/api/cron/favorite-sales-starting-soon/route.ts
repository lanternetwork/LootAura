/**
 * Deprecated endpoint.
 *
 * Favorite sales starting soon emails are now handled by /api/cron/daily.
 * This endpoint is intentionally disabled to prevent duplicate cron paths.
 * 
 * This route is kept as a stub to avoid 404s if any old external integrations
 * or cron configurations still reference it.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { ok: false, deprecated: true, message: 'Use /api/cron/daily for favorite sales starting soon emails' },
    { status: 410 }
  )
}

export async function POST() {
  return NextResponse.json(
    { ok: false, deprecated: true, message: 'Use /api/cron/daily for favorite sales starting soon emails' },
    { status: 410 }
  )
}


