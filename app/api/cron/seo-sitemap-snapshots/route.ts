/**
 * GET/POST /api/cron/seo-sitemap-snapshots
 *
 * Hourly refresh of SEO enablement, qualified metros, and sitemap inventory snapshots.
 * Auth: CRON_SECRET Bearer only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { runSeoSitemapSnapshotsCron } from '@/lib/seo/snapshots/runSeoSitemapSnapshotsCron'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return runSeoSitemapSnapshotsCronRoute(request)
}

export async function POST(request: NextRequest) {
  return runSeoSitemapSnapshotsCronRoute(request)
}

async function runSeoSitemapSnapshotsCronRoute(request: NextRequest) {
  try {
    assertCronAuthorized(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    throw error
  }

  const result = await runSeoSitemapSnapshotsCron()
  return NextResponse.json(result)
}
