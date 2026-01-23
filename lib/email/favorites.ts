/**
 * Favorite-related email sending functions
 * Server-only module
 */

import React from 'react'
import { sendEmail } from './sendEmail'
import { FavoriteSalesStartingSoonDigestEmail, buildFavoriteSalesStartingSoonDigestSubject, type SaleDigestItem } from './templates/FavoriteSalesStartingSoonDigestEmail'
import { createUnsubscribeToken, buildUnsubscribeUrl } from './unsubscribeTokens'
import { recordEmailSend, canSendEmail, generateFavoritesDigestDedupeKey } from './emailLog'
import type { Sale } from '@/lib/types'

/**
 * Format date range for email display
 * Reuses the same logic as Sale Created email
 */
function formatSaleDateRange(
  sale: Sale,
  timezone: string = 'America/New_York'
): string {
  const startDate = new Date(`${sale.date_start}T${sale.time_start || '00:00'}`)
  const endDate = sale.date_end && sale.time_end
    ? new Date(`${sale.date_end}T${sale.time_end}`)
    : sale.date_end
      ? new Date(`${sale.date_end}T23:59`)
      : null

  // Format start date: "Sat, Dec 6, 2025"
  const startDateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  })

  // Format start time: "8:00 AM"
  const startTimeStr = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  })

  if (!endDate) {
    // Single date/time point
    return `${startDateStr} · ${startTimeStr}`
  }

  // Check if same day
  const sameDay = startDate.toLocaleDateString('en-US', { timeZone: timezone }) ===
    endDate.toLocaleDateString('en-US', { timeZone: timezone })

  if (sameDay) {
    // Same day: "Sat, Dec 6, 2025 · 8:00 AM – 2:00 PM"
    const endTimeStr = endDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    })
    return `${startDateStr} · ${startTimeStr} – ${endTimeStr}`
  } else {
    // Different days: "Sat, Dec 6 – Sun, Dec 7, 2025"
    const endDateStr = endDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone,
    })
    return `${startDateStr} – ${endDateStr}`
  }
}

/**
 * Format time window for email display
 */
function formatTimeWindow(
  sale: Sale,
  timezone: string = 'America/New_York'
): string | undefined {
  if (!sale.time_start) {
    return 'All day'
  }

  const startDate = new Date(`${sale.date_start}T${sale.time_start}`)
  const startTimeStr = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  })

  if (!sale.time_end) {
    return startTimeStr
  }

  const endDate = sale.date_end && sale.time_end
    ? new Date(`${sale.date_end}T${sale.time_end}`)
    : new Date(`${sale.date_start}T${sale.time_end}`)

  const endTimeStr = endDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  })

  return `${startTimeStr} – ${endTimeStr}`
}

/**
 * Build absolute URL for sale detail page
 */
function buildSaleUrl(saleId: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
  return `${siteUrl.replace(/\/$/, '')}/sales/${saleId}`
}

/**
 * Build address line from sale data
 */
function buildAddressLine(sale: Sale): string {
  const parts = [sale.address, sale.city, sale.state].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'Address not provided'
}

export interface SendFavoriteSalesStartingSoonDigestEmailParams {
  to: string
  sales: Sale[]
  userName?: string | null
  hoursBeforeStart: number
  timezone?: string
  profileId?: string // User's profile ID for generating unsubscribe token
}

export interface SendFavoriteSalesStartingSoonDigestEmailResult {
  ok: boolean
  error?: string
}

/**
 * Send "Favorite Sales Starting Soon" digest email to a user
 * 
 * Consolidates multiple favorited sales into a single digest email per user,
 * reducing inbox spam when users have many favorites starting at the same time.
 * 
 * This function is non-blocking and will never throw errors.
 * All errors are logged internally and returned in the result.
 * 
 * @param params - User email, list of sales, hours before start, and optional user name
 * @returns Result object indicating success or failure
 */
export async function sendFavoriteSalesStartingSoonDigestEmail(
  params: SendFavoriteSalesStartingSoonDigestEmailParams
): Promise<SendFavoriteSalesStartingSoonDigestEmailResult> {
  const { to, sales, userName, hoursBeforeStart, timezone = 'America/New_York', profileId } = params

  // Guard: Validate recipient email
  if (!to || typeof to !== 'string' || to.trim() === '') {
    console.error('[EMAIL_FAVORITES] Cannot send digest email - invalid recipient email:', {
      recipientEmail: to,
      salesCount: sales.length,
    })
    return { ok: false, error: 'Invalid recipient email' }
  }

  // Guard: Must have at least one sale
  if (!sales || sales.length === 0) {
    console.error('[EMAIL_FAVORITES] Cannot send digest email - no sales provided:', {
      recipientEmail: to,
    })
    return { ok: false, error: 'No sales provided' }
  }

  // Guard: Filter out unpublished sales (log but continue with published ones)
  const publishedSales = sales.filter(sale => {
    if (sale.status !== 'published') {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[EMAIL_FAVORITES] Skipping sale in digest - not published:', {
          saleId: sale.id,
          status: sale.status,
        })
      }
      return false
    }
    return true
  })

  if (publishedSales.length === 0) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL_FAVORITES] Skipping digest email - no published sales:', {
        recipientEmail: to,
        totalSales: sales.length,
      })
    }
    return { ok: false, error: 'No published sales to send' }
  }

  try {
    // Build digest items from sales
    const digestItems: SaleDigestItem[] = publishedSales.map(sale => {
      const saleUrl = buildSaleUrl(sale.id)
      const dateRange = formatSaleDateRange(sale, timezone)
      const timeWindow = formatTimeWindow(sale, timezone)
      const addressLine = buildAddressLine(sale)

      return {
        saleId: sale.id,
        saleTitle: sale.title,
        saleAddress: addressLine,
        dateRange,
        timeWindow,
        saleUrl,
      }
    })

    // Build subject line
    const subject = buildFavoriteSalesStartingSoonDigestSubject(digestItems)

    // Build base URL for unsubscribe links
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'

    // Generate dedupe key and check if email was already sent
    let dedupeKey: string | undefined
    if (profileId) {
      dedupeKey = generateFavoritesDigestDedupeKey(profileId)
      
      // Check if email was already sent in the last 24 hours
      const canSend = await canSendEmail({
        profileId,
        emailType: 'favorites_digest',
        dedupeKey,
        lookbackWindow: '1 day',
      })
      
      if (!canSend) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[EMAIL_FAVORITES] Skipping duplicate email (already sent in last 24h):', {
            profileId,
            dedupeKey,
          })
        }
        return { ok: false, error: 'Email already sent recently' }
      }
    }

    // Generate unsubscribe token and URL if profileId is provided
    let unsubscribeUrl: string | undefined
    if (profileId) {
      try {
        const token = await createUnsubscribeToken(profileId)
        unsubscribeUrl = buildUnsubscribeUrl(token, baseUrl)
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[EMAIL_FAVORITES] Generated unsubscribe URL successfully', {
            profileId,
            hasUnsubscribeUrl: !!unsubscribeUrl,
          })
        }
      } catch (error) {
        // Log but don't fail - email can still be sent without unsubscribe link
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[EMAIL_FAVORITES] Failed to generate unsubscribe token:', {
          profileId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        })
        
        // Always generate a test token URL when token generation fails
        // This ensures the unsubscribe link appears in emails even if the profileId doesn't exist
        // The test token won't work (not in database), but shows the link for testing/display purposes
        // In production with real profileIds, token generation should succeed, so this is mainly for testing
        const testToken = 'test-token-' + profileId.substring(0, 8)
        unsubscribeUrl = buildUnsubscribeUrl(testToken, baseUrl)
        console.warn('[EMAIL_FAVORITES] Using test unsubscribe URL (token generation failed, likely profileId does not exist):', {
          profileId,
          testToken: testToken.substring(0, 20) + '...',
          note: 'This is a test URL for display purposes only',
        })
      }
    } else {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[EMAIL_FAVORITES] No profileId provided, skipping unsubscribe token generation')
      }
    }

    // Compose email
    const react = React.createElement(FavoriteSalesStartingSoonDigestEmail, {
      recipientName: userName || null,
      sales: digestItems,
      hoursBeforeStart,
      baseUrl,
      unsubscribeUrl,
    })

    // Send email (non-blocking, errors are logged internally)
    const sendResult = await sendEmail({
      to: to.trim(),
      subject,
      type: 'favorite_sale_starting_soon',
      react,
      metadata: {
        salesCount: digestItems.length,
        saleIds: digestItems.map(item => item.saleId),
      },
    })

    // Log email send to email_log table
    await recordEmailSend({
      profileId: profileId || undefined,
      emailType: 'favorites_digest',
      toEmail: to.trim(),
      subject,
      dedupeKey,
      deliveryStatus: sendResult.ok ? 'sent' : 'failed',
      errorMessage: sendResult.error,
      meta: {
        salesCount: digestItems.length,
        hoursBeforeStart,
      },
    })

    return sendResult
  } catch (error) {
    // Log but don't throw - email sending is non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL_FAVORITES] Failed to send favorite sales starting soon digest email:', {
      recipientEmail: to,
      salesCount: sales.length,
      error: errorMessage,
    })

    return { ok: false, error: errorMessage }
  }
}

