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
    try {
      assertCronAuthorized(request)
    } catch (error) {
      // assertCronAuthorized throws NextResponse if unauthorized or misconfigured
      if (error instanceof NextResponse) {
        return error
      }
      // If it's not a NextResponse, rethrow
      throw error
    }

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
      const archiveResult = await archiveEndedSales(withOpId)
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

    // Task 2: Expire promotions that have ended
    try {
      const expireResult = await expireEndedPromotions(withOpId)
      results.tasks.expirePromotions = expireResult
    } catch (error) {
      logger.error('Expire promotions task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'expire-promotions',
      }))
      results.tasks.expirePromotions = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 3: Send favorite sales starting soon emails
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
        const favoritesResult = await processFavoriteSalesStartingSoonJob({})
        results.tasks.favoritesStartingSoon = {
          ok: favoritesResult.success,
          error: favoritesResult.error,
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
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting archive sales task', withOpId({
    component: 'api/cron/daily',
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
  // Note: We need to fetch all published/active sales and filter in memory
  // because PostgREST doesn't easily support complex OR conditions
  const { data: allSales, error: queryError } = await fromBase(db, 'sales')
    .select('id, title, date_start, date_end, status, archived_at')
    .in('status', ['published', 'active'])
    .is('archived_at', null)

  if (queryError) {
    const errorMessage = queryError && typeof queryError === 'object' && 'message' in queryError
      ? String(queryError.message)
      : String(queryError)
    logger.error('Failed to query sales for archiving', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
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

  // Log details about what we found for debugging
  logger.info('Archive sales filtering details', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    today: todayStr,
    totalSales: allSales?.length || 0,
    salesToArchiveCount: salesToArchive.length,
    sampleSalesToArchive: salesToArchive.slice(0, 5).map((s: any) => ({
      id: s.id,
      title: s.title?.substring(0, 50),
      date_start: s.date_start,
      date_end: s.date_end,
      status: s.status,
    })),
    // Also log some sales that weren't archived (for debugging)
    sampleSalesNotArchived: (allSales || [])
      .filter((s: any) => !salesToArchive.some((a: any) => a.id === s.id))
      .slice(0, 5)
      .map((s: any) => ({
        id: s.id,
        title: s.title?.substring(0, 50),
        date_start: s.date_start,
        date_end: s.date_end,
        status: s.status,
        reason: s.date_end 
          ? `date_end (${s.date_end}) > today (${todayStr})`
          : s.date_start
          ? `date_start (${s.date_start}) >= today (${todayStr})`
          : 'no dates',
      })),
  }))

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

  // Archive all matching sales by ID
  const saleIdsToArchive = salesToArchive.map((s: any) => s.id)
  if (saleIdsToArchive.length === 0) {
    return {
      ok: true,
      archived: 0,
      errors: 0,
    }
  }

  const { data: archivedSales, error: updateError } = await fromBase(db, 'sales')
    .update({
      status: 'archived',
      archived_at: now.toISOString(),
    })
    .in('id', saleIdsToArchive)
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

async function expireEndedPromotions(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting expire promotions task', withOpId({
    component: 'api/cron/daily',
    task: 'expire-promotions',
  }))

  const db = getAdminDb()
  const now = new Date().toISOString()

  // Find promotions that should be expired:
  // - status is 'active'
  // - ends_at < now
  const { data: expiredPromotions, error: queryError } = await fromBase(db, 'promotions')
    .select('id, sale_id, ends_at')
    .eq('status', 'active')
    .lt('ends_at', now)

  if (queryError) {
    const errorMessage = queryError && typeof queryError === 'object' && 'message' in queryError
      ? String(queryError.message)
      : String(queryError)
    logger.error('Failed to query promotions for expiry', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      error: queryError,
    }))
    throw new Error('Failed to query promotions')
  }

  if (!expiredPromotions || expiredPromotions.length === 0) {
    logger.info('No promotions to expire', withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      count: 0,
    }))
    return {
      ok: true,
      expiredCount: 0,
    }
  }

  // Update all expired promotions to 'expired' status
  const promotionIds = expiredPromotions.map((p) => p.id)
  const { error: updateError } = await fromBase(db, 'promotions')
    .update({
      status: 'expired',
      updated_at: now,
    })
    .in('id', promotionIds)
    .eq('status', 'active') // Only update if still active (idempotent)

  if (updateError) {
    const errorMessage = updateError && typeof updateError === 'object' && 'message' in updateError
      ? String(updateError.message)
      : String(updateError)
    logger.error('Failed to expire promotions', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      error: updateError,
      count: promotionIds.length,
    }))
    throw new Error('Failed to expire promotions')
  }

  logger.info('Promotions expired successfully', withOpId({
    component: 'api/cron/daily',
    task: 'expire-promotions',
    expiredCount: expiredPromotions.length,
    promotionIds: expiredPromotions.map((p) => p.id),
  }))

  return {
    ok: true,
    expiredCount: expiredPromotions.length,
  }
}

