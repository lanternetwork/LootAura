import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getReconciliationHealthSummary } from '@/lib/reconciliation/reconciliationHealthSummary'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

async function reconciliationHealthHandler(_request: NextRequest) {
  try {
    await assertAdminOrThrow(_request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  try {
    const admin = getAdminDb()
    const summary = await getReconciliationHealthSummary(admin, Date.now())
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'admin reconciliation health failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/reconciliation/health' }
    )
    return jsonError(500, 'RECONCILIATION_HEALTH_FAILED', message)
  }
}

export const GET = withRateLimit(reconciliationHealthHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
