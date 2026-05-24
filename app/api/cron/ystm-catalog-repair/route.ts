/**
 * GET/POST /api/cron/ystm-catalog-repair
 *
 * Bounded repair for known YSTM ingested_sales backlog (Phase 5).
 * Auth: CRON_SECRET Bearer only. Aggregate JSON (no raw URLs/HTML).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { runYstmCatalogRepairCron } from '@/lib/ingestion/ystmCoverage/runYstmCatalogRepairCron'
import { getAdminDb } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function catalogRepairCronJsonBody(result: Awaited<ReturnType<typeof runYstmCatalogRepairCron>>) {
  const t = result.telemetry
  return {
    ok: result.ok,
    job: 'ystm_coverage_catalog_repair' as const,
    skipped: t.skipped,
    skipReason: t.skipReason,
    queueOffsetBefore: t.queueOffsetBefore,
    queueOffsetAfter: t.queueOffsetAfter,
    queueTotal: t.queueTotal,
    candidatesScanned: t.candidatesScanned,
    repairAttempts: t.repairAttempts,
    published: t.published,
    geocoded: t.geocoded,
    refreshedReady: t.refreshedReady,
    markedExpired: t.markedExpired,
    skippedNotEligible: t.skippedNotEligible,
    failed: t.failed,
    overlapPrevented: t.overlapPrevented,
    detailFirstAttempted: result.detailFirstMetrics.attempted,
    detailFirstPublished: result.detailFirstMetrics.published,
  }
}

export async function GET(request: NextRequest) {
  return runCatalogRepairCron(request)
}

export async function POST(request: NextRequest) {
  return runCatalogRepairCron(request)
}

async function runCatalogRepairCron(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  const cronAuth = isCronAuthorized(request)
  try {
    const result = await runYstmCatalogRepairCron(getAdminDb())
    return NextResponse.json(catalogRepairCronJsonBody(result))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        ok: false,
        job: 'ystm_coverage_catalog_repair',
        code: 'CATALOG_REPAIR_FAILED',
        message,
        authMode: cronAuth ? 'cron' : 'unknown',
      },
      { status: 500 }
    )
  }
}
