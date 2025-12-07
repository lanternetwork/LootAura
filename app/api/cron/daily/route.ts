/**
 * GET /api/cron/daily
 * POST /api/cron/daily
 * 
 * Unified daily cron endpoint that handles multiple daily tasks:
 * 1. Auto-archive sales that have ended
 * 2. Send favorite sales starting soon emails
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * It should be called by a scheduled job (Vercel Cron, Supabase Cron, etc.)
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Daily at 02:00 UTC
 * - Purpose: Archive ended sales and send favorite sale reminders
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
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

    logger.info('Daily cron job triggered', withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
    }))

    const results: any = {
      ok: true,
      job: 'daily',
      runAt,
      env,
      tasks: {},
    }

    // Task 1: Auto-archive sales that have ended
    try {
      const archiveResult = await archiveEndedSales(withOpId, runAt, env)
      results.tasks.archiveSales = archiveResult
    } catch (error) {
      logger.error('Archive sales task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'archive-sales',
      }))
      results.tasks.archiveSales = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 2: Send favorite sales starting soon emails
    try {
      const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
      if (!emailsEnabled) {
        logger.info('Favorite sales starting soon task skipped - emails disabled', withOpId({
          component: 'api/cron/daily',
          task: 'favorites-starting-soon',
        }))
        results.tasks.favoritesStartingSoon = {
          ok: true,
          skipped: true,
          reason: 'emails_disabled',
        }
      } else {
        const favoritesResult = await processFavoriteSalesStartingSoonJob()
        results.tasks.favoritesStartingSoon = {
          ok: favoritesResult.ok,
          emailsSent: favoritesResult.emailsSent || 0,
          errors: favoritesResult.errors || 0,
        }
      }
    } catch (error) {
      logger.error('Favorites starting soon task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'favorites-starting-soon',
      }))
      results.tasks.favoritesStartingSoon = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Determine overall success (at least one task must succeed)
    const hasSuccess = Object.values(results.tasks).some((task: any) => task.ok === true)
    if (!hasSuccess) {
      results.ok = false
    }

    logger.info('Daily cron job completed', withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
      results,
    }))

    return NextResponse.json(results, { status: results.ok ? 200 : 500 })
  } catch (error) {
    // Handle auth errors (thrown by assertCronAuthorized)
    if (error instanceof NextResponse) {
      return error
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in daily cron', error instanceof Error ? error : new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
    }))

    return NextResponse.json(
      {
        ok: false,
        job: 'daily',
        runAt,
        env,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

async function archiveEndedSales(
  withOpId: (context?: any) => any,
  runAt: string,
  env: string
): Promise<any> {
  logger.info('Starting archive sales task', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
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
      component: 'api/cron/daily',
      task: 'archive-sales',
      error: queryError,
    }))
    throw new Error('Failed to query sales')
  }

  const salesToArchiveCount = salesToArchive?.length || 0

  if (salesToArchiveCount === 0) {
    logger.info('No sales to archive', withOpId({
      component: 'api/cron/daily',
      task: 'archive-sales',
      count: 0,
    }))
    return {
      ok: true,
      archived: 0,
      errors: 0,
    }
  }

  logger.info(`Found ${salesToArchiveCount} sales to archive`, withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
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
      component: 'api/cron/daily',
      task: 'archive-sales',
      error: updateError,
    }))
    throw new Error('Failed to archive sales')
  }

  const archivedCount = archivedSales?.length || 0

  logger.info('Archive sales task completed', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    archivedCount,
  }))

  return {
    ok: true,
    archived: archivedCount,
    errors: 0,
  }
}

