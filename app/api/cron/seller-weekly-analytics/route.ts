/**
 * GET /api/cron/seller-weekly-analytics
 * POST /api/cron/seller-weekly-analytics
 * 
 * Cron endpoint for triggering the "Seller Weekly Analytics" email job.
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * It should be called by a scheduled job (Vercel Cron, Supabase Cron, etc.)
 * to send weekly analytics reports to sellers.
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Weekly on Mondays at 09:00 UTC
 * - Purpose: Send weekly performance emails to sellers for the last full week
 * 
 * Optional query parameter:
 * - date: ISO date string (e.g., "2025-01-06") to compute the week for a specific date
 *   instead of today. Useful for backfilling or testing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { processSellerWeeklyAnalyticsJob } from '@/lib/jobs/processor'
import { logger } from '@/lib/log'

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
  const isProduction = env === 'production'

  try {
    // Validate cron authentication
    assertCronAuthorized(request)

    // Check if emails are globally disabled
    const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
    if (!emailsEnabled) {
      logger.info('Seller weekly analytics cron job skipped - emails disabled', {
        component: 'api/cron/seller-weekly-analytics',
        runAt,
        env,
        emailsEnabled: false,
      })

      return NextResponse.json({
        ok: true,
        job: 'seller-weekly-analytics',
        runAt,
        env,
        emailsEnabled: false,
        message: 'Emails disabled by configuration',
        emailsSent: 0,
      })
    }

    // Parse optional date parameter from query string
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const payload = dateParam ? { date: dateParam } : {}

    logger.info('Seller weekly analytics cron job triggered', {
      component: 'api/cron/seller-weekly-analytics',
      runAt,
      env,
      isProduction,
      emailsEnabled: true,
      dateParam,
    })

    // Execute the job
    const result = await processSellerWeeklyAnalyticsJob(payload)

    if (!result.success) {
      logger.error('Seller weekly analytics job failed', new Error(result.error || 'Unknown error'), {
        component: 'api/cron/seller-weekly-analytics',
        runAt,
        env,
        dateParam,
        error: result.error,
      })

      return NextResponse.json(
        {
          ok: false,
          job: 'seller-weekly-analytics',
          runAt,
          env,
          dateParam: dateParam || undefined,
          error: result.error,
        },
        { status: 500 }
      )
    }

    logger.info('Seller weekly analytics cron job completed', {
      component: 'api/cron/seller-weekly-analytics',
      runAt,
      env,
      dateParam,
    })

    return NextResponse.json({
      ok: true,
      job: 'seller-weekly-analytics',
      runAt,
      env,
      emailsEnabled: true,
      dateParam: dateParam || undefined,
    })
  } catch (error) {
    // Handle auth errors (thrown by assertCronAuthorized)
    if (error instanceof NextResponse) {
      return error
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in seller weekly analytics cron', error instanceof Error ? error : new Error(errorMessage), {
      component: 'api/cron/seller-weekly-analytics',
      runAt,
      env,
    })

    return NextResponse.json(
      {
        ok: false,
        job: 'seller-weekly-analytics',
        runAt,
        env,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

