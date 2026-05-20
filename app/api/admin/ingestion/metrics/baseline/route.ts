import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { setDetailFirstMetricsBaselineNow } from '@/lib/admin/ingestionMetricsBaseline'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  try {
    const baselineAt = await setDetailFirstMetricsBaselineNow(getAdminDb())
    logger.info('Detail-first ingestion metrics baseline reset', {
      component: 'api/admin/ingestion/metrics/baseline',
      operation: 'reset_metrics_baseline',
      baselineAt,
    })
    return NextResponse.json({ ok: true, detailFirstMetricsBaselineAt: baselineAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      'Detail-first ingestion metrics baseline reset failed',
      error instanceof Error ? error : new Error(message),
      {
        component: 'api/admin/ingestion/metrics/baseline',
        operation: 'reset_metrics_baseline',
      }
    )
    return jsonError(500, 'BASELINE_RESET_FAILED', message)
  }
}
