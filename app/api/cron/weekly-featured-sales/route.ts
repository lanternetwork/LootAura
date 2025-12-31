/**
 * GET /api/cron/weekly-featured-sales
 * POST /api/cron/weekly-featured-sales
 * 
 * Cron endpoint for triggering the "Weekly Featured Sales" email job.
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * It should be called by a scheduled job (Vercel Cron, Supabase Cron, etc.)
 * to send weekly featured sales emails to eligible recipients.
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Weekly on Thursdays at 09:00 UTC (early Thursday morning)
 * - Purpose: Send weekly featured sales emails for the next 7 days
 * 
 * Safety gates:
 * - FEATURED_EMAIL_ENABLED: Must be "true" to run (default: false)
 * - FEATURED_EMAIL_SEND_MODE: "compute-only" (default), "allowlist-send", or "full-send"
 * - FEATURED_EMAIL_ALLOWLIST: Comma-separated emails or profile IDs (for compute-only/allowlist-send)
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { processWeeklyFeaturedSalesJob } from '@/lib/jobs/processor'

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
  const { logger, generateOperationId } = await import('@/lib/log')
  const opId = generateOperationId()
  const withOpId = (context: any = {}) => ({ ...context, requestId: opId })

  try {
    // Validate cron authentication
    assertCronAuthorized(request)

    // Check if featured email is enabled
    const featuredEmailEnabled = process.env.FEATURED_EMAIL_ENABLED === 'true'
    if (!featuredEmailEnabled) {
      logger.info('Weekly featured sales cron job skipped - feature disabled', {
        component: 'api/cron/weekly-featured-sales',
        runAt,
        env,
        featuredEmailEnabled: false,
      })

      return NextResponse.json({
        ok: true,
        job: 'weekly-featured-sales',
        runAt,
        env,
        featuredEmailEnabled: false,
        message: 'Feature disabled by configuration (FEATURED_EMAIL_ENABLED not set to "true")',
        emailsSent: 0,
        skipped: true,
      })
    }

    // Check if emails are globally disabled
    const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
    if (!emailsEnabled) {
      logger.info('Weekly featured sales cron job skipped - emails globally disabled', {
        component: 'api/cron/weekly-featured-sales',
        runAt,
        env,
        emailsEnabled: false,
      })

      return NextResponse.json({
        ok: true,
        job: 'weekly-featured-sales',
        runAt,
        env,
        emailsEnabled: false,
        message: 'Emails disabled by configuration (LOOTAURA_ENABLE_EMAILS not set to "true")',
        emailsSent: 0,
        skipped: true,
      })
    }

    // Get send mode (default: compute-only)
    const sendMode = process.env.FEATURED_EMAIL_SEND_MODE || 'compute-only'
    const allowlist = process.env.FEATURED_EMAIL_ALLOWLIST || ''

    logger.info('Weekly featured sales cron job triggered', withOpId({
      component: 'api/cron/weekly-featured-sales',
      runAt,
      env,
      isProduction,
      featuredEmailEnabled: true,
      emailsEnabled: true,
      sendMode,
      hasAllowlist: !!allowlist,
    }))

    // Execute the job
    const result = await processWeeklyFeaturedSalesJob({
      sendMode: sendMode as 'compute-only' | 'allowlist-send' | 'full-send',
      allowlist: allowlist.split(',').map(s => s.trim()).filter(s => s.length > 0),
    })

    if (!result.success) {
      logger.error('Weekly featured sales job failed', new Error(result.error || 'Unknown error'), {
        component: 'api/cron/weekly-featured-sales',
        runAt,
        env,
        sendMode,
        error: result.error,
      })

      return NextResponse.json(
        {
          ok: false,
          job: 'weekly-featured-sales',
          runAt,
          env,
          sendMode,
          error: result.error,
        },
        { status: 500 }
      )
    }

    logger.info('Weekly featured sales cron job completed', {
      component: 'api/cron/weekly-featured-sales',
      runAt,
      env,
      sendMode,
      emailsSent: result.emailsSent || 0,
      errors: result.errors || 0,
    })

    return NextResponse.json({
      ok: true,
      job: 'weekly-featured-sales',
      runAt,
      env,
      featuredEmailEnabled: true,
      emailsEnabled: true,
      sendMode,
      emailsSent: result.emailsSent || 0,
      errors: result.errors || 0,
      recipientsProcessed: result.recipientsProcessed || 0,
    })
  } catch (error) {
    // Handle auth errors (thrown by assertCronAuthorized)
    if (error instanceof NextResponse) {
      return error
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in weekly featured sales cron', error instanceof Error ? error : new Error(errorMessage), {
      component: 'api/cron/weekly-featured-sales',
      runAt,
      env,
    })

    return NextResponse.json(
      {
        ok: false,
        job: 'weekly-featured-sales',
        runAt,
        env,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

