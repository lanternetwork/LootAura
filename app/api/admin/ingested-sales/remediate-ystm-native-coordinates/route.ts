import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  RemediateYstmNativeCoordinatesSchema,
  remediateYstmNativeCoordinatesBacklog,
} from '@/lib/ingestion/spatial/remediateYstmNativeCoordinatesBacklog'
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

  const parsed = RemediateYstmNativeCoordinatesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_BODY', message: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const summary = await remediateYstmNativeCoordinatesBacklog(parsed.data)
    logger.info('YSTM native coordinate remediation completed', {
      component: 'api/admin/ingested-sales/remediate-ystm-native-coordinates',
      operation: 'remediate',
      ...summary,
    })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      'YSTM native coordinate remediation failed',
      error instanceof Error ? error : new Error(message),
      {
        component: 'api/admin/ingested-sales/remediate-ystm-native-coordinates',
        operation: 'remediate',
      }
    )
    return NextResponse.json({ ok: false, code: 'REMEDIATION_FAILED', message }, { status: 500 })
  }
}
