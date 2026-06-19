/**
 * GET/POST /api/cron/ystm-missing-ingest
 *
 * Bounded ingestion for valid external listing URLs missing from LootAura (Phase 3).
 * Auth: CRON_SECRET Bearer only. Aggregate JSON (no raw URLs/HTML).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { runYstmMissingUrlIngestionCron } from '@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron'
import { getAdminDb } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function missingIngestCronJsonBody(result: Awaited<ReturnType<typeof runYstmMissingUrlIngestionCron>>) {
  const t = result.telemetry
  return {
    ok: result.ok,
    job: 'ystm_coverage_missing_ingestion' as const,
    skipped: t.skipped,
    skipReason: t.skipReason,
    queueOffsetBefore: t.queueOffsetBefore,
    queueOffsetAfter: t.queueOffsetAfter,
    queueTotal: t.queueTotal,
    candidatesScanned: t.candidatesScanned,
    detailFirstAttempts: t.detailFirstAttempts,
    published: t.published,
    ingested: t.ingested,
    failed: t.failed,
    skippedVisible: t.skippedVisible,
    skippedExisting: t.skippedExisting,
    skippedCooldown: t.skippedCooldown,
    overlapPrevented: t.overlapPrevented,
    hotQueueTotal: t.hotQueueTotal,
    coldQueueTotal: t.coldQueueTotal,
    reservedHotBudget: t.reservedHotBudget,
    hotFetchLimit: t.hotFetchLimit,
    hotCandidatesScanned: t.hotCandidatesScanned,
    hotCandidatesAttempted: t.hotCandidatesAttempted,
    coldCandidatesScanned: t.coldCandidatesScanned,
    listFastAttempts: t.listFastAttempts,
    listFastPublished: t.listFastPublished,
    listFastFailed: t.listFastFailed,
    detailFirstAttempted: result.detailFirstMetrics.attempted,
    detailFirstPublished: result.detailFirstMetrics.published,
    detailFirstFallback: result.detailFirstMetrics.fallback,
  }
}

export async function GET(request: NextRequest) {
  return runMissingIngestCron(request)
}

export async function POST(request: NextRequest) {
  return runMissingIngestCron(request)
}

async function runMissingIngestCron(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  const cronAuth = isCronAuthorized(request)
  try {
    const result = await runYstmMissingUrlIngestionCron(getAdminDb())
    return NextResponse.json(missingIngestCronJsonBody(result))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        ok: false,
        job: 'ystm_coverage_missing_ingestion',
        code: 'MISSING_INGEST_FAILED',
        message,
        authMode: cronAuth ? 'cron' : 'unknown',
      },
      { status: 500 }
    )
  }
}
