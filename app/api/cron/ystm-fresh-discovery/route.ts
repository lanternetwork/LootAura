/**
 * GET/POST /api/cron/ystm-fresh-discovery
 *
 * 15-minute fresh YSTM list discovery + list-metadata valid-active promotion.
 * Auth: CRON_SECRET Bearer only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { runYstmFreshDiscoveryCron } from '@/lib/ingestion/ystmCoverage/runYstmFreshDiscoveryCron'
import { getAdminDb } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return runFreshDiscoveryCron(request)
}

export async function POST(request: NextRequest) {
  return runFreshDiscoveryCron(request)
}

async function runFreshDiscoveryCron(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  const cronAuth = isCronAuthorized(request)
  try {
    const result = await runYstmFreshDiscoveryCron(getAdminDb())
    return NextResponse.json({
      ok: result.ok,
      job: 'ystm_fresh_discovery' as const,
      authMode: cronAuth ? 'cron' : 'unknown',
      ...result.telemetry,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        ok: false,
        job: 'ystm_fresh_discovery',
        code: 'FRESH_DISCOVERY_FAILED',
        message,
        authMode: cronAuth ? 'cron' : 'unknown',
      },
      { status: 500 }
    )
  }
}
