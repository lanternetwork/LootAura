/**
 * GET/POST /api/cron/ystm-existing-refresh
 *
 * Bounded refresh of known external-source ingested_sales (Phase 4).
 * Auth: CRON_SECRET Bearer only. Aggregate JSON (no raw URLs/HTML).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { runYstmExistingUrlRefreshCron } from '@/lib/ingestion/ystmCoverage/runYstmExistingUrlRefreshCron'
import { getAdminDb } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function existingRefreshCronJsonBody(result: Awaited<ReturnType<typeof runYstmExistingUrlRefreshCron>>) {
  const t = result.telemetry
  return {
    ok: result.ok,
    job: 'ystm_coverage_existing_refresh' as const,
    skipped: t.skipped,
    skipReason: t.skipReason,
    queueOffsetBefore: t.queueOffsetBefore,
    queueOffsetAfter: t.queueOffsetAfter,
    queueTotal: t.queueTotal,
    candidatesScanned: t.candidatesScanned,
    refreshAttempts: t.refreshAttempts,
    refreshed: t.refreshed,
    published: t.published,
    markedExpired: t.markedExpired,
    failed: t.failed,
    skippedFresh: t.skippedFresh,
    overlapPrevented: t.overlapPrevented,
    detailFirstAttempted: result.detailFirstMetrics.attempted,
    detailFirstPublished: result.detailFirstMetrics.published,
  }
}

export async function GET(request: NextRequest) {
  return runExistingRefreshCron(request)
}

export async function POST(request: NextRequest) {
  return runExistingRefreshCron(request)
}

async function runExistingRefreshCron(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  const cronAuth = isCronAuthorized(request)
  try {
    const result = await runYstmExistingUrlRefreshCron(getAdminDb())
    return NextResponse.json(existingRefreshCronJsonBody(result))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        ok: false,
        job: 'ystm_coverage_existing_refresh',
        code: 'EXISTING_REFRESH_FAILED',
        message,
        authMode: cronAuth ? 'cron' : 'unknown',
      },
      { status: 500 }
    )
  }
}
