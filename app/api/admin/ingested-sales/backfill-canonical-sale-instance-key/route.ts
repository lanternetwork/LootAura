import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  RemediateCanonicalSaleInstanceKeySchema,
  remediateCanonicalSaleInstanceKeyBacklog,
} from '@/lib/ingestion/identity/remediateCanonicalSaleInstanceKeyBacklog'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Admin access required' }, { status: 403 })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const parsed = RemediateCanonicalSaleInstanceKeySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_BODY', message: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const summary = await remediateCanonicalSaleInstanceKeyBacklog(parsed.data)
    logger.info('Canonical sale-instance key backfill completed', {
      component: 'api/admin/ingested-sales/backfill-canonical-sale-instance-key',
      operation: 'backfill',
      ...summary,
    })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      'Canonical sale-instance key backfill failed',
      error instanceof Error ? error : new Error(message),
      {
        component: 'api/admin/ingested-sales/backfill-canonical-sale-instance-key',
        operation: 'backfill',
      }
    )
    return NextResponse.json({ ok: false, code: 'BACKFILL_FAILED', message }, { status: 500 })
  }
}
