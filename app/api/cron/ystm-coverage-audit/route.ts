/**
 * GET/POST /api/cron/ystm-coverage-audit
 *
 * Bounded YSTM product-coverage audit (Phase 1 scoreboard denominator).
 * Auth: CRON_SECRET Bearer only. Aggregate JSON (no raw URLs/HTML).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { runYstmCoverageAuditCron } from '@/lib/ingestion/ystmCoverage/runYstmCoverageAuditCron'
import { getAdminDb } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function auditCronJsonBody(result: Awaited<ReturnType<typeof runYstmCoverageAuditCron>>) {
  const t = result.telemetry
  return {
    ok: result.ok,
    job: 'ystm_coverage_audit' as const,
    skipped: t.skipped,
    skipReason: t.skipReason,
    configCursorBefore: t.configCursorBefore,
    configCursorAfter: t.configCursorAfter,
    listPagesFetched: t.listPagesFetched,
    listingUrlsDiscovered: t.listingUrlsDiscovered,
    detailPagesValidated: t.detailPagesValidated,
    validActiveYstmUrls: t.validActiveYstmUrls,
    publishedVisibleInAudit: t.publishedVisibleInAudit,
    lootauraPublishedActiveTotal: t.lootauraPublishedActiveTotal,
    missingValidYstmUrls: t.missingValidYstmUrls,
    coveragePct: t.coveragePct,
    observationCount: t.observationCount,
    overlapPrevented: t.overlapPrevented,
  }
}

export async function GET(request: NextRequest) {
  return runCoverageAuditCron(request)
}

export async function POST(request: NextRequest) {
  return runCoverageAuditCron(request)
}

async function runCoverageAuditCron(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  const cronAuth = isCronAuthorized(request)
  try {
    const result = await runYstmCoverageAuditCron(getAdminDb())
    return NextResponse.json(auditCronJsonBody(result))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        ok: false,
        job: 'ystm_coverage_audit',
        code: 'AUDIT_FAILED',
        message,
        authMode: cronAuth ? 'cron' : 'unknown',
      },
      { status: 500 }
    )
  }
}
