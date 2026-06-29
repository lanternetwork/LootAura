import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { buildIngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/buildIngestionDiagnosticsModel'
import { mergeIngestionMetricsWithDiagnostics } from '@/lib/admin/ingestionMetricsMerge'
import { buildIngestionCoreMetricsResponse } from '@/lib/admin/ingestionMetricsBuilder'
import { buildIngestionDiagnosticsMetricsResponse } from '@/lib/admin/buildIngestionDiagnosticsMetrics'
import { buildYstmCoverageScoreboard } from '@/lib/admin/ystmCoverageScoreboard'
import { getAdminDb } from '@/lib/supabase/clients'

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
    const [core, diagnostics, coverageBoard] = await Promise.all([
      buildIngestionCoreMetricsResponse(),
      buildIngestionDiagnosticsMetricsResponse(),
      buildYstmCoverageScoreboard(getAdminDb()),
    ])

    const metrics = mergeIngestionMetricsWithDiagnostics(core, diagnostics)
    const environment =
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? request.nextUrl.hostname ?? 'unknown'

    const model = buildIngestionDiagnosticsModel({
      metrics,
      coverage: coverageBoard,
      environment,
      generatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, model })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'DIAGNOSTICS_MODEL_FAILED', message)
  }
}
