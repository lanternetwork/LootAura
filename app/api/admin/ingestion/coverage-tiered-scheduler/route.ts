import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  fetchCoverageTieredSchedulerState,
  setCoverageTieredSchedulerEnabled,
} from '@/lib/ingestion/ystmCoverage/coverageTieredSchedulerMode'
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

  let body: { enabled?: boolean }
  try {
    body = (await request.json()) as { enabled?: boolean }
  } catch {
    return jsonError(400, 'INVALID_BODY', 'Expected JSON body { "enabled": true | false }')
  }

  if (typeof body.enabled !== 'boolean') {
    return jsonError(400, 'INVALID_BODY', 'Field "enabled" must be a boolean')
  }

  try {
    const admin = getAdminDb()
    const state = await setCoverageTieredSchedulerEnabled(admin, { enabled: body.enabled })
    logger.info('Coverage tiered scheduler toggled from admin', {
      component: 'api/admin/ingestion/coverage-tiered-scheduler',
      enabled: body.enabled,
    })
    return NextResponse.json({
      ok: true,
      coverageTieredScheduler: {
        enabled: state.enabled,
        enabledAt: state.enabledAt,
        longTailCursor: state.longTailCursor,
        legacyCursor: state.legacyCursor,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'Coverage tiered scheduler toggle failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/coverage-tiered-scheduler' }
    )
    return jsonError(500, 'COVERAGE_TIERED_SCHEDULER_TOGGLE_FAILED', message)
  }
}

export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  try {
    const admin = getAdminDb()
    const state = await fetchCoverageTieredSchedulerState(admin)
    return NextResponse.json({
      ok: true,
      coverageTieredScheduler: {
        enabled: state.enabled,
        enabledAt: state.enabledAt,
        longTailCursor: state.longTailCursor,
        legacyCursor: state.legacyCursor,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'COVERAGE_TIERED_SCHEDULER_READ_FAILED', message)
  }
}
