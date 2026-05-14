import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import {
  buildParserHealthAdminApiResponse,
  buildParserHealthDiagnosticsPayload,
} from '@/lib/parserRegression/parserDiagnosticsAggregate'
import type { RuntimeParserSignalsByHost } from '@/lib/parserRegression/parserDiagnosticsAggregate'
import { parserRegressionPackageRoot } from '@/lib/parserRegression/parserRegressionHarness'
import { scanParserRegressionFixtures } from '@/lib/parserRegression/parserFixtureScan'
import { reportParserHealthTransitions } from '@/lib/parserRegression/reportParserHealth'
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

type ParserHealthBody = {
  runtimeByHost?: RuntimeParserSignalsByHost
}

async function parserHealthHandler(request: NextRequest) {
  try {
    await assertAdminOrCron(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  let runtimeByHost: RuntimeParserSignalsByHost | undefined
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as ParserHealthBody
      if (body && typeof body === 'object' && body.runtimeByHost && typeof body.runtimeByHost === 'object') {
        runtimeByHost = body.runtimeByHost
      }
    } catch {
      runtimeByHost = undefined
    }
  }

  const root = parserRegressionPackageRoot()
  const scanned = scanParserRegressionFixtures(root)
  const evaluatedAtMs = Date.now()
  const payload = buildParserHealthDiagnosticsPayload({
    evaluatedAtMs,
    fixtures: scanned.ok,
    invalid: scanned.invalid,
    runtimeByHost,
  })

  const reportToSentry = request.nextUrl.searchParams.get('report') === '1'
  reportParserHealthTransitions(
    payload.sources.map((s) => ({
      sourceHost: s.sourceHost,
      combinedHealth: s.healthStatus,
      fixtureFreshness: s.freshnessStatus,
      reasons: s.reasonList,
    })),
    evaluatedAtMs,
    { reportToSentry }
  )

  const body = buildParserHealthAdminApiResponse(payload)
  return NextResponse.json(body)
}

export const GET = withRateLimit(parserHealthHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
export const POST = withRateLimit(parserHealthHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
