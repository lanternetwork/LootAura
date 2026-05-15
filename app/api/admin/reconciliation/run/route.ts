import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { reconcileExternalSources } from '@/lib/reconciliation/reconcileExternalSources'
import { parseReconciliationRunBody } from '@/lib/reconciliation/reconciliationRunBody'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

async function assertAdminOrCron(request: NextRequest): Promise<void> {
  if (isCronAuthorized(request)) {
    assertCronAuthorized(request)
    return
  }
  await assertAdminOrThrow(request)
}

async function reconciliationRunHandler(request: NextRequest) {
  const cronAuth = isCronAuthorized(request)
  try {
    await assertAdminOrCron(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      const status = error.status
      if (status === 401) return jsonError(401, 'UNAUTHORIZED', 'Unauthorized')
      if (status === 403) return jsonError(403, 'FORBIDDEN', 'Admin access required')
      if (status === 500) return error
      return jsonError(status, 'AUTH_ERROR', 'Authentication failed')
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  let rawBody: unknown = {}
  try {
    rawBody = await request.json()
  } catch {
    rawBody = {}
  }
  const parsed = parseReconciliationRunBody(rawBody)

  try {
    const result = await reconcileExternalSources({
      limit: parsed.limit,
      dryRun: parsed.dryRun,
      sourcePlatform: parsed.sourcePlatform,
      onlyPlaceholder: parsed.onlyPlaceholder,
      aggregateTelemetryOnly: true,
      telemetryContext: {
        jobType: 'reconciliation.phase1b.run',
        authMode: cronAuth ? 'cron' : 'admin',
      },
    })

    return NextResponse.json({
      ok: true,
      dryRun: result.dryRun,
      persistenceApplied: result.persistenceApplied,
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
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'RECONCILIATION_RUN_FAILED', message)
  }
}

export const POST = withRateLimit(reconciliationRunHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
