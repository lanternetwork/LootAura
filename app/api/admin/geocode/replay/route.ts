import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { runBoundedGeocodeDeadLetterReplay } from '@/lib/geocode/geocodeDeadLetterReplay'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'

type ReplayBody = {
  limit?: number
}

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

async function replayHandler(request: NextRequest) {
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

  let body: ReplayBody = {}
  try {
    body = (await request.json()) as ReplayBody
  } catch {
    body = {}
  }

  const limitParsed = Number(body.limit)
  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(Math.floor(limitParsed), 200) : 25

  let result
  try {
    result = await runBoundedGeocodeDeadLetterReplay({
      limit,
      telemetryContext: { jobType: 'geocode.dead_letter.replay' },
    })
  } catch (error) {
    return jsonError(500, 'REPLAY_FAILED', error instanceof Error ? error.message : 'Replay failed')
  }

  return NextResponse.json({
    ok: true,
    attempted: result.attempted,
    eligible: result.eligible,
    replayed: result.replayed,
    skipped: result.skipped,
    updateErrors: result.updateErrors,
    lostRaces: result.lostRaces,
  })
}

export const POST = withRateLimit(replayHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
