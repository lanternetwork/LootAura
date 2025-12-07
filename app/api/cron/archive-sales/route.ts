/**
 * GET /api/cron/archive-sales
 * POST /api/cron/archive-sales
 * 
 * Cron endpoint for auto-archiving sales that have ended.
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * It should be called by a scheduled job (Vercel Cron, Supabase Cron, etc.)
 * to automatically mark sales as archived once they are over.
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Daily at 02:00 UTC (after most sales have ended)
 * - Purpose: Mark sales with end_date < now() as archived
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger, generateOperationId } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return handleRequest(request)
}

export async function POST(request: NextRequest) {
  return handleRequest(request)
}

async function handleRequest(request: NextRequest) {
  const runAt = new Date().toISOString()
  const env = process.env.NODE_ENV || 'development'
  const opId = generateOperationId()
  const withOpId = (context: any = {}) => ({ ...context, requestId: opId })

  try {
    // Validate cron authentication
    assertCronAuthorized(request)

    logger.info('Auto-archive sales cron job triggered', withOpId({
      component: 'api/cron/archive-sales',
      runAt,
      env,
    }))

    // Get admin DB client (bypasses RLS)
    const db = getAdminDb()
    const now = new Date()
    const today = now.toISOString().split('T')[0] // YYYY-MM-DD format

    // Find sales that should be archived:
    // - status is 'published' or 'active'
    // - end_date < today (sale has ended)
    // - archived_at IS NULL (not already archived)
    const { data: salesToArchive, error: queryError } = await fromBase(db, 'sales')
      .select('id, title, date_end, status')
      .in('status', ['published', 'active'])
      .lt('date_end', today)
      .is('archived_at', null)

    if (queryError) {
      logger.error('Failed to query sales for archiving', queryError instanceof Error ? queryError : new Error(String(queryError)), withOpId({
        component: 'api/cron/archive-sales',
        error: queryError,
      }))

      return NextResponse.json(
        {
          ok: false,
          job: 'archive-sales',
          runAt,
          env,
          error: 'Failed to query sales',
        },
        { status: 500 }
      )
    }

    const salesToArchiveCount = salesToArchive?.length || 0

    if (salesToArchiveCount === 0) {
      logger.info('No sales to archive', withOpId({
        component: 'api/cron/archive-sales',
        runAt,
        env,
        count: 0,
      }))

      return NextResponse.json({
        ok: true,
        job: 'archive-sales',
        runAt,
        env,
        stats: {
          archived: 0,
          errors: 0,
        },
      })
    }

    logger.info(`Found ${salesToArchiveCount} sales to archive`, withOpId({
      component: 'api/cron/archive-sales',
      runAt,
      env,
      count: salesToArchiveCount,
    }))

    // Archive all matching sales
    const { data: archivedSales, error: updateError } = await fromBase(db, 'sales')
      .update({
        status: 'archived',
        archived_at: now.toISOString(),
      })
      .in('status', ['published', 'active'])
      .lt('date_end', today)
      .is('archived_at', null)
      .select('id')

    if (updateError) {
      logger.error('Failed to archive sales', updateError instanceof Error ? updateError : new Error(String(updateError)), withOpId({
        component: 'api/cron/archive-sales',
        error: updateError,
      }))

      return NextResponse.json(
        {
          ok: false,
          job: 'archive-sales',
          runAt,
          env,
          error: 'Failed to archive sales',
        },
        { status: 500 }
      )
    }

    const archivedCount = archivedSales?.length || 0

    logger.info('Auto-archive sales cron job completed', withOpId({
      component: 'api/cron/archive-sales',
      runAt,
      env,
      archivedCount,
    }))

    return NextResponse.json({
      ok: true,
      job: 'archive-sales',
      runAt,
      env,
      stats: {
        archived: archivedCount,
        errors: 0,
      },
    })
  } catch (error) {
    // Handle auth errors (thrown by assertCronAuthorized)
    if (error instanceof NextResponse) {
      return error
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in archive sales cron', error instanceof Error ? error : new Error(errorMessage), withOpId({
      component: 'api/cron/archive-sales',
      runAt,
      env,
    }))

    return NextResponse.json(
      {
        ok: false,
        job: 'archive-sales',
        runAt,
        env,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

