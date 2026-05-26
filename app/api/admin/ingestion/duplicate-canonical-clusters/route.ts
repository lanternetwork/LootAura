import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { listDuplicatePublishedCanonicalClusters } from '@/lib/admin/duplicateCanonicalPublishClusters'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

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

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 50, 1), 100) : 50

  try {
    const clusters = await listDuplicatePublishedCanonicalClusters(getAdminDb(), limit)
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      clusterCount: clusters.length,
      clusters,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'admin duplicate canonical clusters failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/duplicate-canonical-clusters' }
    )
    return jsonError(500, 'DUPLICATE_CANONICAL_CLUSTERS_FAILED', message)
  }
}
