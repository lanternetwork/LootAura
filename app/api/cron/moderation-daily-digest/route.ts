/**
 * GET /api/cron/moderation-daily-digest
 * POST /api/cron/moderation-daily-digest
 * 
 * Daily cron endpoint that sends a moderation digest email to admins
 * with a summary of new sale reports from the last 24 hours.
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Daily at 08:00 UTC
 * - Purpose: Send daily moderation digest to admins
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { sendModerationDailyDigestEmail } from '@/lib/email/moderationDigest'
import { logger, generateOperationId } from '@/lib/log'
import type { ReportDigestItem } from '@/lib/email/templates/ModerationDailyDigestEmail'

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

    logger.info('Moderation daily digest cron job triggered', withOpId({
      component: 'api/cron/moderation-daily-digest',
      runAt,
      env,
    }))

    // Calculate 24-hour window (yesterday to now in UTC)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setUTCHours(yesterday.getUTCHours() - 24)

    const adminDb = getAdminDb()

    // Query for new reports in the last 24 hours
    // Focus on 'open' status, but can include others if needed
    const { data: reports, error: reportsError } = await fromBase(adminDb, 'sale_reports')
      .select(`
        id,
        sale_id,
        reporter_profile_id,
        reason,
        created_at,
        sales:sale_id (
          id,
          title,
          address,
          city,
          state
        )
      `)
      .gte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false })

    if (reportsError) {
      logger.error('Failed to fetch reports for digest', reportsError instanceof Error ? reportsError : new Error(String(reportsError)), withOpId({
        component: 'api/cron/moderation-daily-digest',
        operation: 'fetch_reports',
      }))
      return NextResponse.json({
        ok: false,
        error: 'Failed to fetch reports',
        requestId: opId,
      }, { status: 500 })
    }

    // Transform reports for email template
    const reportItems: ReportDigestItem[] = (reports || []).map((report: any) => {
      const sale = report.sales || {}
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
      
      return {
        reportId: report.id,
        saleId: report.sale_id,
        saleTitle: sale.title || 'Untitled Sale',
        saleAddress: sale.address ? `${sale.address}, ${sale.city || ''}, ${sale.state || ''}`.trim() : 'Address not available',
        reason: report.reason,
        createdAt: report.created_at,
        reporterId: report.reporter_profile_id,
        adminViewUrl: `${baseUrl}/admin/tools/reports?reportId=${report.id}`,
      }
    })

    // Format date window for email
    const dateWindow = yesterday.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }) + ' - ' + now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    // Send email if there are reports (or send empty digest if configured)
    const emailResult = await sendModerationDailyDigestEmail({
      reports: reportItems,
      dateWindow,
    })

    if (!emailResult.ok) {
      logger.error('Failed to send moderation digest email', new Error(emailResult.error || 'Unknown error'), withOpId({
        component: 'api/cron/moderation-daily-digest',
        operation: 'send_email',
        reportCount: reportItems.length,
      }))
      return NextResponse.json({
        ok: false,
        error: 'Failed to send email',
        requestId: opId,
      }, { status: 500 })
    }

    logger.info('Moderation daily digest sent successfully', withOpId({
      component: 'api/cron/moderation-daily-digest',
      operation: 'send_email',
      reportCount: reportItems.length,
      runAt,
    }))

    return NextResponse.json({
      ok: true,
      reportCount: reportItems.length,
      requestId: opId,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logger.error('Unexpected error in moderation daily digest cron', error instanceof Error ? error : new Error(errorMessage), withOpId({
      component: 'api/cron/moderation-daily-digest',
      operation: 'unexpected_error',
    }))

    return NextResponse.json({
      ok: false,
      error: errorMessage,
      requestId: opId,
    }, { status: 500 })
  }
}

