// Admin-only endpoint to manually trigger the archive system
// This allows admins to test and run the archive job on demand

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { logger, generateOperationId } from '@/lib/log'
import { runArchiveEndedSalesJob } from '@/lib/sales/archiveEndedSalesSqlBatch'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  const runAt = new Date().toISOString()
  const opId = generateOperationId()
  const withOpId = (context: Record<string, unknown> = {}) => ({ ...context, requestId: opId })

  try {
    logger.info('Archive system triggered manually by admin', withOpId({
      component: 'api/admin/archive/trigger',
      runAt,
    }))

    const archiveResult = await runArchiveEndedSalesJob({
      logBase: withOpId({ task: 'archive-sales' }),
    })

    return NextResponse.json({
      ok: true,
      runAt,
      ...archiveResult,
    })
  } catch (error) {
    logger.error('Archive system failed', error instanceof Error ? error : new Error(String(error)), withOpId({
      component: 'api/admin/archive/trigger',
    }))
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        runAt,
      },
      { status: 500 }
    )
  }
}
