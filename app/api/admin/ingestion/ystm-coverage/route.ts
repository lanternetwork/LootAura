import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { buildYstmCoverageScoreboard } from '@/lib/admin/ystmCoverageScoreboard'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
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
    const scoreboard = await buildYstmCoverageScoreboard(getAdminDb())
    const body: YstmCoverageMetricsResponse = { ok: true, ...scoreboard }
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('admin ystm coverage scoreboard failed', err instanceof Error ? err : new Error(message), {
      component: 'api/admin/ingestion/ystm-coverage',
    })
    return jsonError(500, 'COVERAGE_SCOREBOARD_FAILED', message)
  }
}
