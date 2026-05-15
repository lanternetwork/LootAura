/**
 * GET/POST /api/cron/reconciliation
 *
 * Scheduled production reconciliation: metadata persistence + Phase 2A safe sync on a
 * conservative batch. Auth: CRON_SECRET Bearer only. Response contains aggregate counters only.
 *
 * Schedule: vercel.json (default every 30 minutes). Tune `CRON_RECONCILIATION_BATCH_LIMIT` (1–100).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { parseCronReconciliationBatchLimit } from '@/lib/reconciliation/cronReconciliation'
import { reconcileExternalSources } from '@/lib/reconciliation/reconcileExternalSources'

export const dynamic = 'force-dynamic'

/** Expose only aggregate counters (no URLs, descriptions, HTML, or row identifiers beyond counts). */
function cronReconciliationJsonBody(result: Awaited<ReturnType<typeof reconcileExternalSources>>) {
  return {
    ok: true as const,
    job: 'reconciliation_cron' as const,
    dryRun: result.dryRun,
    applySafeSync: result.applySafeSync,
    persistenceApplied: result.persistenceApplied,
    publicSalesUpdated: !result.dryRun && result.salesSyncUpdated > 0,
    attempted: result.attempted,
    processed: result.processed,
    changed: result.changed,
    unchanged: result.unchanged,
    failed: result.failed,
    parseFailed: result.parseFailed,
    sourceMissingSoft: result.sourceMissingSoft,
    placeholderResolved: result.placeholderResolved,
    unsupportedSource: result.unsupportedSource,
    refreshCapability: result.refreshCapability,
    salesSyncAttempted: result.salesSyncAttempted,
    salesSyncUpdated: result.salesSyncUpdated,
    salesSyncSkipped: result.salesSyncSkipped,
    descriptionsUpdated: result.descriptionsUpdated,
    imagesUpdated: result.imagesUpdated,
    schedulesUpdated: result.schedulesUpdated,
    titlesUpdated: result.titlesUpdated,
    manualReviewRequired: result.manualReviewRequired,
  }
}

export async function GET(request: NextRequest) {
  return runReconciliationCron(request)
}

export async function POST(request: NextRequest) {
  return runReconciliationCron(request)
}

async function runReconciliationCron(request: NextRequest) {
  const cronAuth = isCronAuthorized(request)
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  const limit = parseCronReconciliationBatchLimit()

  try {
    const result = await reconcileExternalSources({
      limit,
      dryRun: false,
      applySafeSync: true,
      aggregateTelemetryOnly: true,
      telemetryContext: {
        jobType: 'cron.reconciliation.phase2a',
        authMode: cronAuth ? 'cron' : 'unknown',
      },
    })
    return NextResponse.json(cronReconciliationJsonBody(result))
  } catch (_err) {
    return NextResponse.json({ ok: false, code: 'RECONCILIATION_CRON_FAILED' }, { status: 500 })
  }
}
