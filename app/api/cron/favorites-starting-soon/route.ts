/**
 * GET /api/cron/favorites-starting-soon
 * POST /api/cron/favorites-starting-soon
 * 
 * Cron endpoint for triggering the "Favorite Sale Starting Soon" email job.
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * It should be called by a scheduled job (Vercel Cron, Supabase Cron, etc.)
 * to send reminder emails for favorited sales starting soon.
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Daily at 09:00 UTC
 * - Purpose: Send reminders for favorited sales starting within the next N hours
 *   (configured via EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START)
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
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
      logger.info('Favorite sales starting soon cron job skipped - emails disabled', {
        component: 'api/cron/favorites-starting-soon',
        runAt,
        env,
        emailsEnabled: false,
      })

      return NextResponse.json({
        ok: true,
        job: 'favorite-sales-starting-soon',
        runAt,
        env,
        emailsEnabled: false,
        message: 'Emails disabled by configuration',
        stats: { emailsSent: 0, errors: 0 },
      })
    }

    logger.info('Favorite sales starting soon cron job triggered', {
      component: 'api/cron/favorites-starting-soon',
      runAt,
      env,
      isProduction,
      emailsEnabled: true,
    })

    // Execute the job
    const result = await processFavoriteSalesStartingSoonJob({})

    if (!result.success) {
      logger.error('Favorite sales starting soon job failed', new Error(result.error || 'Unknown error'), {
        component: 'api/cron/favorites-starting-soon',
        runAt,
        env,
        error: result.error,
      })

      return NextResponse.json(
        {
          ok: false,
          job: 'favorite-sales-starting-soon',
          runAt,
          env,
          error: result.error,
        },
        { status: 500 }
      )
    }

    logger.info('Favorite sales starting soon cron job completed', {
      component: 'api/cron/favorites-starting-soon',
      runAt,
      env,
    })

    return NextResponse.json({
      ok: true,
      job: 'favorite-sales-starting-soon',
      runAt,
      env,
      emailsEnabled: true,
      stats: { emailsSent: 0, errors: 0 }, // Job processor doesn't expose these stats yet
    })
  } catch (error) {
    // Handle auth errors (thrown by assertCronAuthorized)
    if (error instanceof NextResponse) {
      return error
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in favorite sales starting soon cron', error instanceof Error ? error : new Error(errorMessage), {
      component: 'api/cron/favorites-starting-soon',
      runAt,
      env,
    })

    return NextResponse.json(
      {
        ok: false,
        job: 'favorite-sales-starting-soon',
        runAt,
        env,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

