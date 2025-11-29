/**
 * Trigger Sale Created Confirmation Email
 * Server-only module
 */

import React from 'react'
import { sendEmail } from '../sendEmail'
import { SaleCreatedConfirmationEmail, getSaleCreatedSubject } from '../templates/SaleCreatedConfirmationEmail'

export interface TriggerSaleCreatedConfirmationParams {
  userId: string
  email: string
  displayName?: string
  saleId: string
  saleTitle: string
  saleAddressLine: string
  startsAt: Date
  endsAt?: Date
  timezone: string
}

/**
 * Format date range text for email display
 * Example: "Sat, Dec 7 · 8:00 am – 2:00 pm"
 */
function formatSaleDateRange(
  startsAt: Date,
  endsAt: Date | undefined,
  timezone: string
): string {
  const startDate = new Date(startsAt)
  const endDate = endsAt ? new Date(endsAt) : null

  // Format start date: "Sat, Dec 7"
  const startDateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  })

  // Format start time: "8:00 am"
  const startTimeStr = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  })

  if (!endDate) {
    // Single time point
    return `${startDateStr} · ${startTimeStr}`
  }

  // Format end time: "2:00 pm"
  const endTimeStr = endDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  })

  return `${startDateStr} · ${startTimeStr} – ${endTimeStr}`
}

/**
 * Build absolute URL for sale detail page
 */
function buildSaleUrl(saleId: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
  return `${siteUrl.replace(/\/$/, '')}/sales/${saleId}`
}

/**
 * Trigger sale created confirmation email
 * Fire-and-forget: does not await or throw errors
 */
export async function triggerSaleCreatedConfirmation(
  params: TriggerSaleCreatedConfirmationParams
): Promise<void> {
  const {
    email,
    displayName,
    saleId,
    saleTitle,
    saleAddressLine,
    startsAt,
    endsAt,
    timezone,
  } = params

  try {
    // Build sale URL
    const saleUrl = buildSaleUrl(saleId)

    // Format date range
    const saleDateRangeText = formatSaleDateRange(startsAt, endsAt, timezone)

    // Compose email
    const react = React.createElement(SaleCreatedConfirmationEmail, {
      recipientName: displayName,
      saleTitle,
      saleAddress: saleAddressLine,
      dateRange: saleDateRangeText,
      saleUrl,
      manageUrl: buildSaleUrl(saleId).replace('/sales/', '/dashboard'),
    })

    // Send email (non-blocking, errors are logged internally)
    await sendEmail({
      to: email,
      subject: getSaleCreatedSubject(saleTitle),
      type: 'sale_created_confirmation',
      react,
      metadata: {
        saleId,
        userId: params.userId,
      },
    })
  } catch (error) {
    // Log but don't throw - email sending is non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL_TRIGGER] Failed to trigger sale created confirmation:', {
      saleId,
      email,
      error: errorMessage,
    })
  }
}

