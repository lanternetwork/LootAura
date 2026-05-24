import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  evaluateCoverageBootstrapExitCriteria,
  fetchCoverageBootstrapState,
  setCoverageBootstrapEnabled,
  type CoverageBootstrapDisabledReason,
} from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
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

  const reason: CoverageBootstrapDisabledReason = 'admin'

  try {
    const admin = getAdminDb()
    const state = await setCoverageBootstrapEnabled(admin, {
      enabled: body.enabled,
      reason,
    })
    logger.info('Coverage bootstrap toggled from admin', {
      component: 'api/admin/ingestion/coverage-bootstrap',
      enabled: body.enabled,
    })
    return NextResponse.json({
      ok: true,
      coverageBootstrap: {
        enabled: state.enabled,
        enabledAt: state.enabledAt,
        disabledAt: state.disabledAt,
        disabledReason: state.disabledReason,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'Coverage bootstrap toggle failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/coverage-bootstrap' }
    )
    return jsonError(500, 'COVERAGE_BOOTSTRAP_TOGGLE_FAILED', message)
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
    const state = await fetchCoverageBootstrapState(getAdminDb())
    return NextResponse.json({
      ok: true,
      coverageBootstrap: {
        enabled: state.enabled,
        enabledAt: state.enabledAt,
        disabledAt: state.disabledAt,
        disabledReason: state.disabledReason,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'COVERAGE_BOOTSTRAP_READ_FAILED', message)
  }
}
