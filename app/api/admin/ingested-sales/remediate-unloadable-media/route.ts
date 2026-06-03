import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  RemediateUnloadableImportedSaleMediaSchema,
  remediateUnloadableImportedSaleMedia,
} from '@/lib/ingestion/images/remediateUnloadableImportedSaleMedia'
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

  const parsed = RemediateUnloadableImportedSaleMediaSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_BODY', message: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const summary = await remediateUnloadableImportedSaleMedia(parsed.data)
    logger.info('Unloadable imported sale media remediation completed', {
      component: 'api/admin/ingested-sales/remediate-unloadable-media',
      operation: 'remediate',
      ...summary,
    })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      'Unloadable imported sale media remediation failed',
      error instanceof Error ? error : new Error(message),
      {
        component: 'api/admin/ingested-sales/remediate-unloadable-media',
        operation: 'remediate',
      }
    )
    return NextResponse.json({ ok: false, code: 'REMEDIATION_FAILED', message }, { status: 500 })
  }
}
