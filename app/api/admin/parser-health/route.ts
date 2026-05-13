import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { buildParserDiagnosticsFromFixtures } from '@/lib/parserRegression/buildParserDiagnostics'
import { parserRegressionPackageRoot } from '@/lib/parserRegression/parserRegressionHarness'
import { reportParserHealthTransition } from '@/lib/parserRegression/reportParserHealth'
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

async function parserHealthHandler(request: NextRequest) {
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

  const nowMs = Date.now()
  let snapshot
  try {
    snapshot = buildParserDiagnosticsFromFixtures(parserRegressionPackageRoot(), nowMs)
  } catch (error) {
    return jsonError(500, 'DIAGNOSTICS_FAILED', error instanceof Error ? error.message : 'Diagnostics failed')
  }

  reportParserHealthTransition(snapshot, nowMs)

  return NextResponse.json({
    ok: true,
    sources: snapshot.sources,
    summary: snapshot.summary,
    degradedSources: snapshot.degradedSources,
    failingSources: snapshot.failingSources,
    recommendedAction: snapshot.recommendedAction,
  })
}

export const GET = withRateLimit(parserHealthHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
