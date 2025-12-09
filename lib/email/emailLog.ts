/**
 * Email logging and deduplication helpers
 * Server-only module for recording email sends and preventing duplicates
 */

import { getAdminDb, fromBase } from '@/lib/supabase/clients'

export interface RecordEmailSendOptions {
  profileId?: string
  emailType: string
  toEmail: string
  subject: string
  dedupeKey?: string
  deliveryStatus?: 'sent' | 'failed' | 'queued'
  errorMessage?: string
  meta?: Record<string, unknown>
}

export interface CanSendEmailOptions {
  profileId: string
  emailType: string
  dedupeKey: string
  lookbackWindow?: string // PostgreSQL interval, e.g. '1 day' or '7 days'
}

/**
 * Record an email send in the email_log table
 * 
 * This function never throws - logging failures are logged as warnings
 * and do not affect email sending.
 * 
 * @param options - Email send details
 * @returns Promise that resolves when logging is complete (or failed silently)
 */
export async function recordEmailSend(options: RecordEmailSendOptions): Promise<void> {
  const {
    profileId,
    emailType,
    toEmail,
    subject,
    dedupeKey,
    deliveryStatus = 'sent',
    errorMessage,
    meta = {},
  } = options

  try {
    const admin = getAdminDb()
    
    // Truncate error message to prevent excessive storage
    const truncatedError = errorMessage
      ? errorMessage.substring(0, 500) // Limit to 500 chars
      : null

    const { error } = await fromBase(admin, 'email_log').insert({
      profile_id: profileId || null,
      email_type: emailType,
      to_email: toEmail,
      subject: subject.substring(0, 500), // Limit subject length
      dedupe_key: dedupeKey || null,
      delivery_status: deliveryStatus,
      error_message: truncatedError,
      meta: meta || {},
    })

    if (error) {
      // Log but don't throw - email logging should never break email sending
      console.warn('[EMAIL_LOG] Failed to record email send:', {
        emailType,
        toEmail: toEmail.substring(0, 20) + '...', // Partial email for debugging
        error: error.message,
        errorCode: error.code,
      })
    } else if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL_LOG] Recorded email send:', {
        emailType,
        toEmail: toEmail.substring(0, 20) + '...',
        deliveryStatus,
        hasDedupeKey: !!dedupeKey,
      })
    }
  } catch (error) {
    // Catch any unexpected errors and log them
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn('[EMAIL_LOG] Unexpected error recording email send:', {
      emailType,
      toEmail: toEmail.substring(0, 20) + '...',
      error: errorMessage,
    })
  }
}

/**
 * Check if an email with the given dedupe key was already sent recently
 * 
 * This can be used to prevent duplicate emails within a time window.
 * 
 * @param options - Deduplication check parameters
 * @returns Promise<boolean> - true if email was already sent, false if it's safe to send
 */
export async function canSendEmail(options: CanSendEmailOptions): Promise<boolean> {
  const {
    profileId,
    emailType,
    dedupeKey,
    lookbackWindow = '1 day',
  } = options

  try {
    const admin = getAdminDb()

    // Query for recent emails with matching dedupe key
    const { data, error } = await fromBase(admin, 'email_log')
      .select('id')
      .eq('profile_id', profileId)
      .eq('email_type', emailType)
      .eq('dedupe_key', dedupeKey)
      .gte('sent_at', `now() - interval '${lookbackWindow}'`)
      .limit(1)

    if (error) {
      // On error, allow sending (fail open) but log the error
      console.warn('[EMAIL_LOG] Error checking dedupe, allowing send:', {
        profileId: profileId.substring(0, 8) + '...',
        emailType,
        dedupeKey,
        error: error.message,
      })
      return true // Fail open - allow sending if we can't check
    }

    // If we found a matching email, it was already sent
    const alreadySent = data && data.length > 0

    if (alreadySent && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL_LOG] Duplicate email detected, skipping send:', {
        profileId: profileId.substring(0, 8) + '...',
        emailType,
        dedupeKey,
        lookbackWindow,
      })
    }

    return !alreadySent // Return true if NOT already sent (safe to send)
  } catch (error) {
    // On unexpected error, fail open (allow sending)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn('[EMAIL_LOG] Unexpected error checking dedupe, allowing send:', {
      profileId: profileId.substring(0, 8) + '...',
      emailType,
      dedupeKey,
      error: errorMessage,
    })
    return true // Fail open - allow sending if we can't check
  }
}

/**
 * Generate a dedupe key for favorites digest email
 * Format: {profileId}:favorites_digest:{YYYY-MM-DD}
 */
export function generateFavoritesDigestDedupeKey(profileId: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD
  return `${profileId}:favorites_digest:${dateStr}`
}

/**
 * Generate a dedupe key for seller weekly analytics email
 * Format: {profileId}:seller_weekly:{YYYY-WW}
 */
export function generateSellerWeeklyDedupeKey(profileId: string, weekStart: Date): string {
  // Calculate ISO week number
  const date = new Date(weekStart)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  const year = d.getUTCFullYear()
  
  return `${profileId}:seller_weekly:${year}-W${weekNo.toString().padStart(2, '0')}`
}

