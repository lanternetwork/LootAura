/**
 * GET/POST /api/cron/discovery
 *
 * Scheduled external source discovery, promotion, and registry self-healing.
 * Auth: CRON_SECRET Bearer only. Aggregate JSON response (no raw URLs/HTML).
 *
 * Schedule: vercel.json (default 02:00, 08:00, 14:00, 20:00 UTC). Tune CRON_DISCOVERY_* env vars.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'
import { runSourceDiscoveryCron } from '@/lib/ingestion/discovery/runSourceDiscoveryCron'
import { recordDiscoveryCronOrchestrationRun } from '@/lib/ingestion/orchestrationMetrics'
import { getAdminDb } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function discoveryCronJsonBody(result: Awaited<ReturnType<typeof runSourceDiscoveryCron>>) {
  const t = result.telemetry
  return {
    ok: result.ok,
    job: 'discovery_cron' as const,
    skipped: result.skipped,
    skipReason: result.skipReason ?? null,
    statesScanned: t.statesScanned,
    stateCursorBefore: t.stateCursorBefore,
    stateCursorAfter: t.stateCursorAfter,
    catalogSize: t.catalogSize,
    stateBatchPlanned: t.stateBatchPlanned,
    graphEnumerationSkippedReason: t.graphEnumerationSkippedReason ?? null,
    candidatePagesDiscovered: t.candidatePagesDiscovered,
    candidatePagesValid: t.candidatePagesValid,
    candidatePagesInvalid: t.candidatePagesInvalid,
    candidateRegistryUpserts: t.candidateRegistryUpserts,
    graphEnumerationValidations: t.graphEnumerationValidations,
    graphEnumerationThrottled: t.graphEnumerationThrottled,
    configsPromoted: t.configsPromoted,
    configsRepaired: t.configsRepaired,
    placeholderRepairRepaired: t.placeholderRepairRepaired,
    placeholderRepairFailed: t.placeholderRepairFailed,
    configsRevalidated: t.configsRevalidated,
    configsFailed: t.configsFailed,
    placeholdersUnresolved: t.placeholdersUnresolved,
    crawlableConfigCount: t.crawlableConfigCount,
    failedConfigCount: t.failedConfigCount,
    crawlExcludedConfigCount: t.crawlExcludedConfigCount,
    discoveryLatencyMs: t.discoveryLatencyMs,
    repairRate: t.repairRate,
    overlapPrevented: t.overlapPrevented,
    staleLockRecovered: t.staleLockRecovered,
    degraded: t.degraded,
    phasesCompleted: t.phasesCompleted,
  }
}

export async function GET(request: NextRequest) {
  return runDiscoveryCron(request)
}

export async function POST(request: NextRequest) {
  return runDiscoveryCron(request)
}

async function runDiscoveryCron(request: NextRequest) {
  const cronAuth = isCronAuthorized(request)
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  const startedAtMs = Date.now()
  try {
    const result = await runSourceDiscoveryCron(getAdminDb(), {
      telemetryContext: {
        authMode: cronAuth ? 'cron' : 'unknown',
      },
    })
    const t = result.telemetry
    void recordDiscoveryCronOrchestrationRun({
      durationMs: Date.now() - startedAtMs,
      note: {
        ok: result.ok,
        skipped: result.skipped,
        skipReason: result.skipReason ?? null,
        degraded: t.degraded,
        statesScanned: t.statesScanned,
        catalogSize: t.catalogSize,
        stateBatchPlanned: t.stateBatchPlanned,
        stateCursorBefore: t.stateCursorBefore,
        stateCursorAfter: t.stateCursorAfter,
        overlapPrevented: t.overlapPrevented,
        graphEnumerationSkippedReason: t.graphEnumerationSkippedReason ?? null,
        graphEnumerationThrottled: t.graphEnumerationThrottled,
        phasesCompleted: t.phasesCompleted,
        configsPromoted: t.configsPromoted,
        configsRepaired: t.configsRepaired,
        configsRevalidated: t.configsRevalidated,
        configsFailed: t.configsFailed,
        crawlableConfigCount: t.crawlableConfigCount,
        failedConfigCount: t.failedConfigCount,
        crawlExcludedConfigCount: t.crawlExcludedConfigCount,
        candidatePagesDiscovered: t.candidatePagesDiscovered,
        candidatePagesValid: t.candidatePagesValid,
      },
    })
    const status = result.ok ? 200 : 500
    return NextResponse.json(discoveryCronJsonBody(result), { status })
  } catch (_err) {
    return NextResponse.json({ ok: false, code: 'DISCOVERY_CRON_FAILED' }, { status: 500 })
  }
}
