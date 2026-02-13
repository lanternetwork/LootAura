/**
 * Featured Sales Email
 * Server-only module for sending weekly featured sales emails
 */

import React from 'react'
import { sendEmail } from './sendEmail'
import { redactEmailForLogging } from './logging'
import { createUnsubscribeToken, buildUnsubscribeUrl } from './unsubscribeTokens'
import { FeaturedSalesEmail, buildFeaturedSalesSubject, type FeaturedSaleItem } from './templates/FeaturedSalesEmail'
import { canSendEmail, recordEmailSend } from './emailLog'

export interface SendFeaturedSalesEmailParams {
  to: string
  recipientName?: string | null
  sales: FeaturedSaleItem[]
  profileId: string
  weekKey: string
}

export interface SendFeaturedSalesEmailResult {
  ok: boolean
  error?: string
}

/**
 * Generate dedupe key for featured sales email
 * Ensures one email per week per recipient
 */
function generateFeaturedSalesDedupeKey(profileId: string, weekKey: string): string {
  return `featured_sales_${profileId}_${weekKey}`
}

/**
 * Build sale URL from sale ID
 */
function buildSaleUrl(saleId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
  return `${baseUrl.replace(/\/$/, '')}/s/${saleId}`
}

/**
 * Format sale date range
 */
function formatSaleDateRange(sale: { date_start: string; date_end?: string | null }): string {
  const start = new Date(sale.date_start)
  const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  if (sale.date_end && sale.date_end !== sale.date_start) {
    const end = new Date(sale.date_end)
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${startFormatted} - ${endFormatted}`
  }
  
  return startFormatted
}

/**
 * Build address line from sale
 */
function buildAddressLine(sale: { address_line1?: string | null; address_city?: string | null; address_region?: string | null }): string | undefined {
  const parts: string[] = []
  if (sale.address_line1) parts.push(sale.address_line1)
  if (sale.address_city) parts.push(sale.address_city)
  if (sale.address_region) parts.push(sale.address_region)
  return parts.length > 0 ? parts.join(', ') : undefined
}

/**
 * Send featured sales email to a recipient
 */
export async function sendFeaturedSalesEmail(
  params: SendFeaturedSalesEmailParams
): Promise<SendFeaturedSalesEmailResult> {
  const { to, recipientName, sales, profileId, weekKey } = params

  // Guard: Validate recipient email
  if (!to || typeof to !== 'string' || to.trim() === '') {
    console.error('[EMAIL_FEATURED_SALES] Cannot send email - invalid recipient email:', {
      recipientEmail: redactEmailForLogging(to),
      salesCount: sales.length,
    })
    return { ok: false, error: 'Invalid recipient email' }
  }

  // Guard: Must have exactly 12 sales
  if (!sales || sales.length !== 12) {
    console.error('[EMAIL_FEATURED_SALES] Cannot send email - must have exactly 12 sales:', {
      recipientEmail: redactEmailForLogging(to),
      salesCount: sales.length,
    })
    return { ok: false, error: 'Must have exactly 12 sales' }
  }

  try {
    // Build base URL for unsubscribe links
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'

    // Generate dedupe key and check if email was already sent
    const dedupeKey = generateFeaturedSalesDedupeKey(profileId, weekKey)
    
    const canSend = await canSendEmail({
      profileId,
      emailType: 'featured_sales',
      dedupeKey,
      lookbackWindow: '7 days',
    })
    
    if (!canSend) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[EMAIL_FEATURED_SALES] Skipping duplicate email (already sent for this week):', {
          profileId,
          dedupeKey,
        })
      }
      return { ok: false, error: 'Email already sent for this week' }
    }

    // Generate unsubscribe token and URL
    let unsubscribeUrl: string | undefined
    try {
      const token = await createUnsubscribeToken(profileId)
      unsubscribeUrl = buildUnsubscribeUrl(token, baseUrl)
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[EMAIL_FEATURED_SALES] Generated unsubscribe URL successfully', {
          profileId,
          hasUnsubscribeUrl: !!unsubscribeUrl,
        })
      }
    } catch (error) {
      // Log but don't fail - email can still be sent without unsubscribe link
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[EMAIL_FEATURED_SALES] Failed to generate unsubscribe token:', {
        profileId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      
      // Generate a test token URL when token generation fails (for display purposes)
      const testToken = 'test-token-' + profileId.substring(0, 8)
      unsubscribeUrl = buildUnsubscribeUrl(testToken, baseUrl)
      console.warn('[EMAIL_FEATURED_SALES] Using test unsubscribe URL (token generation failed):', {
        profileId,
        testToken: testToken.substring(0, 20) + '...',
        note: 'This is a test URL for display purposes only',
      })
    }

    // Compose email
    const react = React.createElement(FeaturedSalesEmail, {
      recipientName,
      sales,
      baseUrl,
      unsubscribeUrl,
    })

    const subject = buildFeaturedSalesSubject(sales.length)

    // Send email (non-blocking, errors are logged internally)
    const sendResult = await sendEmail({
      to: to.trim(),
      subject,
      type: 'featured_sales',
      react,
      metadata: {
        recipientEmail: to,
        salesCount: sales.length,
        weekKey,
      },
    })

    if (!sendResult.ok) {
      return { ok: false, error: sendResult.error || 'Failed to send email' }
    }

    // Record email send for deduplication
    try {
      await recordEmailSend({
        profileId,
        emailType: 'featured_sales',
        toEmail: to.trim(),
        subject,
        dedupeKey,
        deliveryStatus: 'sent',
        meta: {
          salesCount: sales.length,
          weekKey,
        },
      })
    } catch (error) {
      // Log but don't fail - email was sent successfully
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn('[EMAIL_FEATURED_SALES] Failed to record email send (non-critical):', {
        profileId,
        error: errorMessage,
      })
    }

    return { ok: true }
  } catch (error) {
    // Log but don't throw - email sending is non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL_FEATURED_SALES] Failed to send featured sales email:', {
      recipientEmail: redactEmailForLogging(to),
      profileId,
      error: errorMessage,
    })

    return { ok: false, error: errorMessage }
  }
}

/**
 * Convert sale data to FeaturedSaleItem for email template
 */
export function convertSaleToFeaturedItem(sale: {
  id: string
  title: string
  date_start: string
  date_end?: string | null
  address_line1?: string | null
  address_city?: string | null
  address_region?: string | null
  cover_image_url?: string | null
}): FeaturedSaleItem {
  return {
    saleId: sale.id,
    saleTitle: sale.title,
    saleAddress: buildAddressLine(sale),
    dateRange: formatSaleDateRange(sale),
    saleUrl: buildSaleUrl(sale.id),
    coverImageUrl: sale.cover_image_url || undefined,
  }
}

