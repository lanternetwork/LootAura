/**
 * Seller analytics email sending functions
 * Server-only module
 */

import React from 'react'
import { sendEmail } from './sendEmail'
import { SellerWeeklyAnalyticsEmail, buildSellerWeeklyAnalyticsSubject } from './templates/SellerWeeklyAnalyticsEmail'
import type { SellerWeeklyAnalytics } from '@/lib/data/sellerAnalytics'

export interface SendSellerWeeklyAnalyticsEmailParams {
  to: string
  ownerDisplayName?: string | null
  metrics: SellerWeeklyAnalytics
  weekStart: string
  weekEnd: string
  dashboardUrl?: string
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
  const { to, ownerDisplayName, metrics, weekStart, weekEnd, dashboardUrl } = params

  // Guard: Validate recipient email
  if (!to || typeof to !== 'string' || to.trim() === '') {
    console.error('[EMAIL_SELLER_ANALYTICS] Cannot send email - invalid recipient email:', {
      recipientEmail: to,
    })
    return { ok: false, error: 'Invalid recipient email' }
  }

  // Guard: Only send if there are metrics
  if (metrics.totalViews === 0 && metrics.totalSaves === 0 && metrics.totalClicks === 0) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL_SELLER_ANALYTICS] Skipping email - no metrics:', {
        recipientEmail: to,
      })
    }
    return { ok: false, error: 'No metrics to report' }
  }

  try {
    // Build URLs
    const dashboardUrlFinal = dashboardUrl || buildDashboardUrl()
    const { weekStart: weekStartFormatted, weekEnd: weekEndFormatted } = formatDateRange(weekStart, weekEnd)

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
    })

    // Send email (non-blocking, errors are logged internally)
    await sendEmail({
      to: to.trim(),
      subject: buildSellerWeeklyAnalyticsSubject(weekStartFormatted),
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

    return { ok: true }
  } catch (error) {
    // Log but don't throw - email sending is non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL_SELLER_ANALYTICS] Failed to send seller weekly analytics email:', {
      recipientEmail: to,
      error: errorMessage,
    })

    return { ok: false, error: errorMessage }
  }
}

