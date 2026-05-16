import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildIngestionIntegrityResponse } from '@/lib/admin/ingestionIntegrity'

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

  const admin = getAdminDb()
  try {
    const { data, error } = await admin.rpc('ingestion_integrity_report')
    if (error) {
      const msg = error.message || 'RPC failed'
      const missingFn =
        msg.includes('ingestion_integrity_report') &&
        (msg.includes('does not exist') || msg.includes('42883') || msg.toLowerCase().includes('function'))
      logger.error('admin ingestion integrity RPC failed', new Error(msg), {
        component: 'api/admin/ingestion/integrity',
        missingFn,
      })
      return jsonError(
        missingFn ? 503 : 500,
        missingFn ? 'INTEGRITY_RPC_MISSING' : 'INTEGRITY_RPC_FAILED',
        missingFn
          ? 'Database function lootaura_v2.ingestion_integrity_report is missing; apply migration 168.'
          : msg
      )
    }

    const body = buildIngestionIntegrityResponse(data, { includeRaw: request.nextUrl.searchParams.get('debug') === '1' })
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'admin ingestion integrity failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/integrity' }
    )
    return jsonError(500, 'INTEGRITY_FAILED', message)
  }
}
