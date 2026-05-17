import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  RemediateGatedAddressBacklogSchema,
  remediateGatedAddressBacklog,
} from '@/lib/ingestion/address/remediateGatedAddressBacklog'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

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

  const parsed = RemediateGatedAddressBacklogSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_BODY', message: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const summary = await remediateGatedAddressBacklog(parsed.data)
    logger.info('Gated address backlog remediation completed', {
      component: 'api/admin/ingested-sales/remediate-gated-address',
      operation: 'remediate',
      ...summary,
    })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      'Gated address backlog remediation failed',
      error instanceof Error ? error : new Error(message),
      {
        component: 'api/admin/ingested-sales/remediate-gated-address',
        operation: 'remediate',
      }
    )
    return NextResponse.json({ ok: false, code: 'REMEDIATION_FAILED', message }, { status: 500 })
  }
}
