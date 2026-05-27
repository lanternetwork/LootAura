/**
 * GET/POST /api/cron/ystm-weekly-digest
 *
 * Phase 9 (Workstream I): weekly aggregate digest for YSTM stabilization state.
 * Auth: CRON_SECRET Bearer only. Returns aggregate JSON + markdown digest, no raw URLs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { buildYstmCoverageDiagnostics } from '@/lib/admin/buildYstmCoverageDiagnostics'
import { buildYstmCoverageScoreboard } from '@/lib/admin/ystmCoverageScoreboard'
import { getAdminDb } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  return runYstmWeeklyDigestRoute(request)
}

export async function POST(request: NextRequest) {
  return runYstmWeeklyDigestRoute(request)
}

async function runYstmWeeklyDigestRoute(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const coverage = await buildYstmCoverageScoreboard(getAdminDb())
    const digest = buildYstmCoverageDiagnostics({ ok: true, ...coverage })

    return NextResponse.json({
      ok: true,
      job: 'ystm_weekly_digest' as const,
      generatedAt: coverage.generatedAt,
      coveragePct: coverage.coveragePct,
      validActiveYstmUrls: coverage.validActiveYstmUrls,
      missingValidYstmUrls: coverage.missingValidYstmUrls,
      catalogRepairQueue: coverage.pipelineBacklog.catalogRepairQueue,
      existingRefreshStale: coverage.pipelineBacklog.existingRefreshStale,
      duplicatePublishedCanonicalClusters:
        coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters,
      digest,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        ok: false,
        job: 'ystm_weekly_digest',
        code: 'YSTM_WEEKLY_DIGEST_FAILED',
        message,
      },
      { status: 500 }
    )
  }
}

