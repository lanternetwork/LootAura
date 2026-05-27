/**
 * GET/POST /api/cron/duplicate-canonical-slo
 *
 * Phase 1A: daily check that duplicate canonical publish clusters = 0.
 * Auth: CRON_SECRET Bearer only. Aggregate JSON (no raw URLs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { runDuplicateCanonicalPublishSloCron } from '@/lib/ingestion/identity/runDuplicateCanonicalPublishSloCron'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return runDuplicateCanonicalSloRoute(request)
}

export async function POST(request: NextRequest) {
  return runDuplicateCanonicalSloRoute(request)
}

async function runDuplicateCanonicalSloRoute(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    throw error
  }

  const result = await runDuplicateCanonicalPublishSloCron()
  return NextResponse.json({
    ok: result.ok,
    job: 'duplicate_canonical_publish_slo' as const,
    duplicateClusterCount: result.duplicateClusterCount,
    sloMet: result.sloMet,
    checkedAt: result.checkedAt,
  })
}
