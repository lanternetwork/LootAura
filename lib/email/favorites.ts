/**
 * Favorite-related email sending functions
 * Server-only module
 */

import React from 'react'
import { sendEmail } from './sendEmail'
import { FavoriteSaleStartingSoonEmail, buildFavoriteSaleStartingSoonSubject } from './templates/FavoriteSaleStartingSoonEmail'
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

export interface SendFavoriteSaleStartingSoonEmailParams {
  to: string
  sale: Sale
  userName?: string | null
  timezone?: string
}

export interface SendFavoriteSaleStartingSoonEmailResult {
  ok: boolean
  error?: string
}

/**
 * Send "Favorite Sale Starting Soon" email to a user
 * 
 * This function is non-blocking and will never throw errors.
 * All errors are logged internally and returned in the result.
 * 
 * @param params - User email, sale, and optional user name
 * @returns Result object indicating success or failure
 */
export async function sendFavoriteSaleStartingSoonEmail(
  params: SendFavoriteSaleStartingSoonEmailParams
): Promise<SendFavoriteSaleStartingSoonEmailResult> {
  const { to, sale, userName, timezone = 'America/New_York' } = params

  // Guard: Only send for published sales
  if (sale.status !== 'published') {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL_FAVORITES] Skipping email - sale not published:', {
        saleId: sale.id,
        status: sale.status,
      })
    }
    return { ok: false, error: 'Sale is not published' }
  }

  // Guard: Validate recipient email
  if (!to || typeof to !== 'string' || to.trim() === '') {
    console.error('[EMAIL_FAVORITES] Cannot send email - invalid recipient email:', {
      saleId: sale.id,
      recipientEmail: to,
    })
    return { ok: false, error: 'Invalid recipient email' }
  }

  try {
    // Build URLs
    const saleUrl = buildSaleUrl(sale.id)

    // Format date range and time window
    const dateRange = formatSaleDateRange(sale, timezone)
    const timeWindow = formatTimeWindow(sale, timezone)
    const addressLine = buildAddressLine(sale)

    // Compose email
    const react = React.createElement(FavoriteSaleStartingSoonEmail, {
      recipientName: userName || null,
      saleTitle: sale.title,
      saleAddress: addressLine,
      dateRange,
      timeWindow,
      saleUrl,
    })

    // Send email (non-blocking, errors are logged internally)
    await sendEmail({
      to: to.trim(),
      subject: buildFavoriteSaleStartingSoonSubject(sale.title),
      type: 'favorite_sale_starting_soon',
      react,
      metadata: {
        saleId: sale.id,
        saleTitle: sale.title,
      },
    })

    return { ok: true }
  } catch (error) {
    // Log but don't throw - email sending is non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL_FAVORITES] Failed to send favorite sale starting soon email:', {
      saleId: sale.id,
      recipientEmail: to,
      error: errorMessage,
    })

    return { ok: false, error: errorMessage }
  }
}

