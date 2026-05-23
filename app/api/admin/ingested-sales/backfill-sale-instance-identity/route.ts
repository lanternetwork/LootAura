import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  RemediateYstmSaleInstanceIdentitySchema,
  remediateYstmSaleInstanceIdentityBacklog,
} from '@/lib/ingestion/identity/remediateYstmSaleInstanceIdentityBacklog'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'
/** Backfill can process many rows; default Vercel limit is too low for maxRows 5000. */
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

  const parsed = RemediateYstmSaleInstanceIdentitySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_BODY', message: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const summary = await remediateYstmSaleInstanceIdentityBacklog(parsed.data)
    logger.info('YSTM sale-instance identity backfill completed', {
      component: 'api/admin/ingested-sales/backfill-sale-instance-identity',
      operation: 'backfill',
      ...summary,
    })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      'YSTM sale-instance identity backfill failed',
      error instanceof Error ? error : new Error(message),
      {
        component: 'api/admin/ingested-sales/backfill-sale-instance-identity',
        operation: 'backfill',
      }
    )
    return NextResponse.json({ ok: false, code: 'BACKFILL_FAILED', message }, { status: 500 })
  }
}
