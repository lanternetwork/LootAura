// Admin-only endpoint to manually trigger the archive system
// This allows admins to test and run the archive job on demand

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger, generateOperationId } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function triggerArchiveHandler(request: NextRequest) {
  try {
    // Require admin access
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    )
  }

  const runAt = new Date().toISOString()
  const opId = generateOperationId()
  const withOpId = (context: any = {}) => ({ ...context, requestId: opId })

  try {
    logger.info('Archive system triggered manually by admin', withOpId({
      component: 'api/admin/archive/trigger',
      runAt,
    }))

    // Call the archive function directly
    const archiveResult = await archiveEndedSales(withOpId)

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

async function archiveEndedSales(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting archive sales task', withOpId({
    component: 'api/admin/archive/trigger',
    task: 'archive-sales',
  }))

  // Get admin DB client (bypasses RLS)
  const db = getAdminDb()
  const now = new Date()
  // Use UTC date to avoid timezone issues
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD format

  // Find sales that should be archived:
  // - status is 'published' or 'active'
  // - (end_date <= today OR (end_date IS NULL AND date_start < today))
  // - archived_at IS NULL (not already archived)
  const { data: allSales, error: queryError } = await fromBase(db, 'sales')
    .select('id, title, date_start, date_end, status, archived_at')
    .in('status', ['published', 'active'])
    .is('archived_at', null)

  if (queryError) {
    const errorMessage = queryError && typeof queryError === 'object' && 'message' in queryError
      ? String(queryError.message)
      : String(queryError)
    logger.error('Failed to query sales for archiving', new Error(errorMessage), withOpId({
      component: 'api/admin/archive/trigger',
      task: 'archive-sales',
      error: queryError,
    }))
    throw new Error('Failed to query sales')
  }

  // Filter sales that have ended:
  // - Sales with date_end <= today (ended today or before)
  // - Sales without date_end but with date_start < today (single-day sales that started in the past)
  const salesToArchive = (allSales || []).filter((sale: any) => {
    if (sale.date_end) {
      // Parse date_end and compare properly
      const endDate = new Date(sale.date_end + 'T00:00:00Z')
      // Archive if end date is today or in the past
      return endDate <= today
    }
    // If no end_date, check if start_date is in the past (single-day sale)
    if (sale.date_start) {
      // Parse date_start and compare properly
      const startDate = new Date(sale.date_start + 'T00:00:00Z')
      // Archive if start date is before today (sale already happened)
      return startDate < today
    }
    // If no dates at all, don't archive (shouldn't happen for published sales)
    return false
  })

  const saleIdsToArchive = salesToArchive.map((s: any) => s.id)
  const salesToArchiveList = salesToArchive.map((s: any) => ({
    id: s.id,
    title: s.title || 'Untitled',
    date_end: s.date_end || null,
  }))

  if (saleIdsToArchive.length === 0) {
    logger.info('No sales to archive', withOpId({
      component: 'api/admin/archive/trigger',
      task: 'archive-sales',
    }))
    return {
      ok: true,
      archived: 0,
      errors: 0,
      message: 'No sales found that need archiving',
    }
  }

  logger.info(`Found ${saleIdsToArchive.length} sales to archive`, withOpId({
    component: 'api/admin/archive/trigger',
    task: 'archive-sales',
    count: saleIdsToArchive.length,
    saleIds: saleIdsToArchive.slice(0, 10), // Log first 10 IDs
  }))

  const { data: archivedSales, error: updateError } = await fromBase(db, 'sales')
    .update({
      status: 'archived',
      archived_at: now.toISOString(),
    })
    .in('id', saleIdsToArchive)
    .select('id')

  if (updateError) {
    logger.error('Failed to archive sales', updateError instanceof Error ? updateError : new Error(String(updateError)), withOpId({
      component: 'api/admin/archive/trigger',
      task: 'archive-sales',
      error: updateError,
    }))
    throw new Error('Failed to archive sales')
  }

  const archivedCount = archivedSales?.length || 0

  logger.info('Archive sales task completed', withOpId({
    component: 'api/admin/archive/trigger',
    task: 'archive-sales',
    archivedCount,
  }))

    return {
      ok: true,
      archived: archivedCount,
      errors: 0,
      salesArchived: salesToArchiveList.slice(0, 20), // Return first 20 for display
    }
}

export async function POST(request: NextRequest) {
  return triggerArchiveHandler(request)
}

