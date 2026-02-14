/**
 * Seller analytics email sending functions
 * Server-only module
 */

import React from 'react'
import { sendEmail } from './sendEmail'
import { redactEmailForLogging } from './logging'
import { SellerWeeklyAnalyticsEmail, buildSellerWeeklyAnalyticsSubject } from './templates/SellerWeeklyAnalyticsEmail'
import { createUnsubscribeToken, buildUnsubscribeUrl } from './unsubscribeTokens'
import { recordEmailSend, canSendEmail, generateSellerWeeklyDedupeKey } from './emailLog'
import { logger } from '@/lib/log'
import type { SellerWeeklyAnalytics } from '@/lib/data/sellerAnalytics'

export interface SendSellerWeeklyAnalyticsEmailParams {
  to: string
  ownerDisplayName?: string | null
  metrics: SellerWeeklyAnalytics
  weekStart: string
  weekEnd: string
  dashboardUrl?: string
  profileId?: string // User's profile ID for generating unsubscribe token
}

export interface SendSellerWeeklyAnalyticsEmailResult {
  ok: boolean
  error?: string
}

/**
 * Build absolute URL for seller dashboard
 */
function buildDashboardUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
  return `${siteUrl.replace(/\/$/, '')}/dashboard`
}

/**
 * Format date range for email display
 */
function formatDateRange(start: string, end: string): { weekStart: string; weekEnd: string } {
  try {
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    // Format as "Mon, Jan 1" or "Mon, Jan 1, 2025" if different year
    const startYear = startDate.getFullYear()
    const endYear = endDate.getFullYear()
    const currentYear = new Date().getFullYear()
    
    const startFormatted = startDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(startYear !== currentYear ? { year: 'numeric' } : {}),
    })
    
    const endFormatted = endDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(endYear !== currentYear ? { year: 'numeric' } : {}),
    })
    
    return {
      weekStart: startFormatted,
      weekEnd: endFormatted,
    }
  } catch {
    // Fallback to ISO strings if parsing fails
    return {
      weekStart: start.split('T')[0],
      weekEnd: end.split('T')[0],
    }
  }
}

/**
 * Send seller weekly analytics email
 * 
 * This function is non-blocking and will never throw errors.
 * All errors are logged internally and returned in the result.
 * 
 * @param params - Owner email, metrics, and date range
 * @returns Result object indicating success or failure
 */
export async function sendSellerWeeklyAnalyticsEmail(
  params: SendSellerWeeklyAnalyticsEmailParams
): Promise<SendSellerWeeklyAnalyticsEmailResult> {
  const { to, ownerDisplayName, metrics, weekStart, weekEnd, dashboardUrl, profileId } = params

  // Guard: Validate recipient email
  if (!to || typeof to !== 'string' || to.trim() === '') {
    console.error('[EMAIL_SELLER_ANALYTICS] Cannot send email - invalid recipient email:', {
      recipientEmail: redactEmailForLogging(to),
    })
    return { ok: false, error: 'Invalid recipient email' }
  }

  // Guard: Only send if there are metrics
  if (metrics.totalViews === 0 && metrics.totalSaves === 0 && metrics.totalClicks === 0) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL_SELLER_ANALYTICS] Skipping email - no metrics:', {
        recipientEmail: redactEmailForLogging(to),
      })
    }
    return { ok: false, error: 'No metrics to report' }
  }

  try {
    // Build URLs
    const dashboardUrlFinal = dashboardUrl || buildDashboardUrl()
    const { weekStart: weekStartFormatted, weekEnd: weekEndFormatted } = formatDateRange(weekStart, weekEnd)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'

    // Build subject early (needed for error logging if token generation fails)
    const subject = buildSellerWeeklyAnalyticsSubject(weekStartFormatted)

    // Generate dedupe key and check if email was already sent
    let dedupeKey: string | undefined
    if (profileId) {
      const weekStartDate = new Date(weekStart)
      dedupeKey = generateSellerWeeklyDedupeKey(profileId, weekStartDate)
      
      // Check if email was already sent for this week
      const canSend = await canSendEmail({
        profileId,
        emailType: 'seller_weekly',
        dedupeKey,
        lookbackWindow: '7 days',
      })
      
      if (!canSend) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[EMAIL_SELLER_ANALYTICS] Skipping duplicate email (already sent for this week):', {
            profileId,
            dedupeKey,
          })
        }
        return { ok: false, error: 'Email already sent for this week' }
      }
    }

    // Generate unsubscribe token and URL if profileId is provided
    let unsubscribeUrl: string | undefined
    if (profileId) {
      try {
        const token = await createUnsubscribeToken(profileId)
        unsubscribeUrl = buildUnsubscribeUrl(token, baseUrl)
        logger.debug('Generated unsubscribe URL successfully', {
          component: 'email',
          operation: 'seller_analytics',
          hasUnsubscribeUrl: !!unsubscribeUrl,
        })
      } catch (error) {
        // Fail closed: token generation failure prevents email send
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Extract non-sensitive error code if available (Supabase errors have a code property)
        const errorCode = (error as any)?.code && typeof (error as any).code === 'string' 
          ? (error as any).code 
          : undefined
        
        console.error('[EMAIL_SELLER_ANALYTICS] Failed to generate unsubscribe token, aborting email send:', {
          profileId: profileId.substring(0, 8) + '...',
          error: errorMessage,
        })
        
        // Record failed attempt in email_log with fixed, non-sensitive error message
        await recordEmailSend({
          profileId,
          emailType: 'seller_weekly',
          toEmail: to.trim(),
          subject,
          dedupeKey,
          deliveryStatus: 'failed',
          errorMessage: 'Unsubscribe token generation failed',
          meta: {
            totalViews: metrics.totalViews,
            totalSaves: metrics.totalSaves,
            totalClicks: metrics.totalClicks,
            topSalesCount: metrics.topSales.length,
            weekStart,
            weekEnd,
            failureReason: 'token_generation_failed',
            ...(errorCode && { errorCode }),
          },
        })
        
        return { ok: false, error: `Failed to generate unsubscribe token: ${errorMessage}` }
      }
    } else {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[EMAIL_SELLER_ANALYTICS] No profileId provided, skipping unsubscribe token generation')
      }
    }

    // Compose email
    const react = React.createElement(SellerWeeklyAnalyticsEmail, {
      ownerDisplayName,
      totalViews: metrics.totalViews,
      totalSaves: metrics.totalSaves,
      totalClicks: metrics.totalClicks,
      topSales: metrics.topSales.map(sale => ({
        title: sale.saleTitle,
        views: sale.views,
        saves: sale.saves,
        clicks: sale.clicks,
        ctr: sale.ctr,
      })),
      dashboardUrl: dashboardUrlFinal,
      weekStart: weekStartFormatted,
      weekEnd: weekEndFormatted,
      baseUrl,
      unsubscribeUrl,
    })

    // Send email (non-blocking, errors are logged internally)
    const sendResult = await sendEmail({
      to: to.trim(),
      subject,
      type: 'seller_weekly_analytics',
      react,
      metadata: {
        ownerEmail: to,
        totalViews: metrics.totalViews,
        totalSaves: metrics.totalSaves,
        totalClicks: metrics.totalClicks,
        topSalesCount: metrics.topSales.length,
      },
    })

    // Log email send to email_log table
    await recordEmailSend({
      profileId: profileId || undefined,
      emailType: 'seller_weekly',
      toEmail: to.trim(),
      subject,
      dedupeKey,
      deliveryStatus: sendResult.ok ? 'sent' : 'failed',
      errorMessage: sendResult.error,
      meta: {
        totalViews: metrics.totalViews,
        totalSaves: metrics.totalSaves,
        totalClicks: metrics.totalClicks,
        topSalesCount: metrics.topSales.length,
        weekStart,
        weekEnd,
        ...(sendResult.resendEmailId && { resendEmailId: sendResult.resendEmailId }),
      },
    })

    return sendResult
  } catch (error) {
    // Log but don't throw - email sending is non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL_SELLER_ANALYTICS] Failed to send seller weekly analytics email:', {
      recipientEmail: redactEmailForLogging(to),
      error: errorMessage,
    })

    return { ok: false, error: errorMessage }
  }
}

