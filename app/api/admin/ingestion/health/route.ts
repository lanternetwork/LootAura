import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { runIngestionHealthPipeline } from '@/lib/observability/ingestionHealthWiring'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

/**
 * Admin ingestion operational health: evaluates Tier 0 signals and returns JSON.
 * Sentry transition reporting runs unless `?report=0` (dry read).
 */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  const reportToSentry = request.nextUrl.searchParams.get('report') !== '0'

  try {
    const admin = getAdminDb()
    const { signals, evaluation } = await runIngestionHealthPipeline({
      admin,
      reportToSentry,
    })
    return NextResponse.json({
      ok: true,
      evaluation,
      signals: {
        evaluatedAtIso: signals.evaluatedAtIso,
        queueDepth: signals.queueDepth,
        staleBacklogAgeMs: signals.staleBacklogAgeMs,
        starvationDetected: signals.starvationDetected,
        retryExhaustionCount: signals.retryExhaustionCount,
        retryExhaustionRatio: signals.retryExhaustionRatio,
        publishFailureRate: signals.publishFailureRate,
        geocodeFailureRate: signals.geocodeFailureRate,
        archivePendingCount: signals.archivePendingCount,
        leaseConflictCount: signals.leaseConflictCount,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'admin ingestion health failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/health' }
    )
    return jsonError(500, 'INGESTION_HEALTH_FAILED', message)
  }
}
