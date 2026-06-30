import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { buildIngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/buildIngestionDiagnosticsModel'
import { mergeIngestionMetricsWithDiagnostics } from '@/lib/admin/ingestionMetricsMerge'
import { buildIngestionCoreMetricsResponse } from '@/lib/admin/ingestionMetricsBuilder'
import { buildIngestionDiagnosticsMetricsResponse } from '@/lib/admin/buildIngestionDiagnosticsMetrics'
import { buildYstmCoverageScoreboard } from '@/lib/admin/ystmCoverageScoreboard'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { getAdminDb } from '@/lib/supabase/clients'
import {
  buildIngestionDiagnosticsPerformance,
  emptyCoveragePerformance,
} from '@/lib/admin/diagnostics/v4/performance/buildDiagnosticsPerformance'
import { DiagnosticsWriteCounter } from '@/lib/admin/diagnostics/v4/performance/writeCounter'
import { elapsedMs, monotonicNow, timeAsync } from '@/lib/admin/diagnostics/v4/performance/timing'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

export async function GET(request: NextRequest) {
  const apiRouteStart = monotonicNow()

  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  try {
    const buildStart = monotonicNow()
    const writeCounter = new DiagnosticsWriteCounter()
    const coverageTimings = emptyCoveragePerformance()

    const [[core, coreMetricsDurationMs], [diagnostics, diagnosticsMetricsDurationMs], coverageBoard] =
      await Promise.all([
        timeAsync(() => buildIngestionCoreMetricsResponse()),
        timeAsync(() => buildIngestionDiagnosticsMetricsResponse()),
        (async () => {
          const coverageStart = monotonicNow()
          const board = await buildYstmCoverageScoreboard(getAdminDb(), {
            writeCounter,
            coverage: coverageTimings,
          })
          return { board, durationMs: elapsedMs(coverageStart) }
        })(),
      ])

    const coverageScoreboardDurationMs = coverageBoard.durationMs

    const mergeStart = monotonicNow()
    const metrics = mergeIngestionMetricsWithDiagnostics(core, diagnostics)
    const mergeDurationMs = elapsedMs(mergeStart)

    const coverage: YstmCoverageMetricsResponse = { ok: true, ...coverageBoard.board }
    const environment =
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? request.nextUrl.hostname ?? 'unknown'
    const generatedAt = new Date().toISOString()

    const modelBuildStart = monotonicNow()
    const model = buildIngestionDiagnosticsModel({
      metrics,
      coverage,
      environment,
      generatedAt,
    })
    const modelBuildDurationMs = elapsedMs(modelBuildStart)
    const totalDurationMs = elapsedMs(buildStart)

    const performanceSnapshot = buildIngestionDiagnosticsPerformance({
      generatedAt,
      apiRouteDurationMs: elapsedMs(apiRouteStart),
      totalDurationMs,
      coreMetricsDurationMs,
      diagnosticsMetricsDurationMs,
      coverageScoreboardDurationMs,
      mergeDurationMs,
      modelBuildDurationMs,
      jsonPayloadBytes: null,
      coverage: coverageTimings,
      writeCounter,
    })

    const modelWithPerformance = { ...model, performance: performanceSnapshot }
    const responseBody = { ok: true as const, model: modelWithPerformance }
    const jsonPayloadBytes = Buffer.byteLength(JSON.stringify(responseBody), 'utf8')
    const performanceWithPayload = {
      ...performanceSnapshot,
      json_payload_bytes: jsonPayloadBytes,
    }
    const finalModel = { ...model, performance: performanceWithPayload }

    logger.info('ingestion_diagnostics_model_build_timing', {
      component: 'api/admin/ingestion/diagnostics-model',
      operation: 'ingestion_diagnostics_model_build_timing',
      total_duration_ms: performanceWithPayload.total_duration_ms,
      slowest_stage: performanceWithPayload.slowest_stage,
      slowest_stage_duration_ms: performanceWithPayload.slowest_stage_duration_ms,
      slowest_stage_kind: performanceWithPayload.slowest_stage_kind,
      core_metrics_duration_ms: performanceWithPayload.core_metrics_duration_ms,
      diagnostics_metrics_duration_ms: performanceWithPayload.diagnostics_metrics_duration_ms,
      coverage_scoreboard_duration_ms: performanceWithPayload.coverage_scoreboard_duration_ms,
      write_count: performanceWithPayload.write_count,
      sequential_write_count: performanceWithPayload.sequential_write_count,
      environment,
    })

    return NextResponse.json({ ok: true, model: finalModel })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'DIAGNOSTICS_MODEL_FAILED', message)
  }
}
