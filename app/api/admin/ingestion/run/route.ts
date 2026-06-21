import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  isAdminIngestionJobKey,
  type AdminIngestionJobRunResponse,
} from '@/lib/admin/ingestion/adminIngestionJobTypes'
import { runAdminIngestionJob } from '@/lib/admin/ingestion/runAdminIngestionJob'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      const status = error.status
      if (status === 401) return jsonError(401, 'UNAUTHORIZED', 'Unauthorized')
      if (status === 403) return jsonError(403, 'FORBIDDEN', 'Admin access required')
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Request body must be JSON')
  }

  const job = typeof body === 'object' && body != null && 'job' in body ? (body as { job: unknown }).job : null
  if (!isAdminIngestionJobKey(job)) {
    return jsonError(400, 'INVALID_JOB', 'Unknown or missing job key')
  }

  const result: AdminIngestionJobRunResponse = await runAdminIngestionJob(job)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
