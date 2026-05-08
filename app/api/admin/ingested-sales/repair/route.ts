import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { runIngestedSalesRepair } from '@/lib/ingestion/ingestedSalesRepair'

export const dynamic = 'force-dynamic'

type RepairBody = {
  dryRun?: boolean
  limit?: number
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

async function repairHandler(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      const status = error.status
      if (status === 401) return jsonError(401, 'UNAUTHORIZED', 'Unauthorized')
      if (status === 403) return jsonError(403, 'FORBIDDEN', 'Admin access required')
      return jsonError(status, 'AUTH_ERROR', 'Authentication failed')
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  let body: RepairBody = {}
  try {
    body = (await request.json()) as RepairBody
  } catch {
    body = {}
  }

  const dryRun = body.dryRun !== false
  const limitParsed = Number(body.limit)
  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(Math.floor(limitParsed), 2000) : 500

  let result
  try {
    result = await runIngestedSalesRepair({ dryRun, limit })
  } catch (error) {
    return jsonError(500, 'LOAD_FAILED', error instanceof Error ? error.message : 'Failed to load linked rows')
  }

  return NextResponse.json({
    ok: true,
    ...result,
  })
}

export const POST = withRateLimit(repairHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])

