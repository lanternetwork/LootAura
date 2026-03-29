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
  /** Owner profile UUID, or `null` for system emails (e.g. moderation digest) where `email_log.profile_id` is null. */
  profileId: string | null
  emailType: string
  dedupeKey: string
  lookbackWindow?: string // PostgreSQL interval, e.g. '1 day' or '7 days'
}

/** `duplicate` = row exists in window. `dedupe_error` = query failed (send must not proceed). */
export type CanSendEmailResult =
  | { allowed: true }
  | { allowed: false; reason: 'duplicate' | 'dedupe_error' }

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
 * Check if an email with the given dedupe key was already sent recently.
 * On query failure, returns `{ allowed: false, reason: 'dedupe_error' }` (fail closed).
 */
export async function canSendEmail(options: CanSendEmailOptions): Promise<CanSendEmailResult> {
  const {
    profileId,
    emailType,
    dedupeKey,
    lookbackWindow = '1 day',
  } = options

  const profileLabel =
    profileId === null ? 'system(null)' : `${profileId.substring(0, 8)}...`

  try {
    const admin = getAdminDb()

    let query = fromBase(admin, 'email_log')
      .select('id')
      .eq('email_type', emailType)
      .eq('dedupe_key', dedupeKey)
      .gte('sent_at', `now() - interval '${lookbackWindow}'`)
      .limit(1)

    if (profileId === null) {
      query = query.is('profile_id', null)
    } else {
      query = query.eq('profile_id', profileId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[EMAIL_LOG] Dedupe check failed — blocking send (fail closed):', {
        profileId: profileLabel,
        emailType,
        dedupeKey,
        error: error.message,
        errorCode: (error as { code?: string }).code,
      })
      return { allowed: false, reason: 'dedupe_error' }
    }

    const alreadySent = data && data.length > 0

    if (alreadySent && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL_LOG] Duplicate email detected, skipping send:', {
        profileId: profileLabel,
        emailType,
        dedupeKey,
        lookbackWindow,
      })
    }

    if (alreadySent) {
      return { allowed: false, reason: 'duplicate' }
    }

    return { allowed: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL_LOG] Unexpected error checking dedupe — blocking send (fail closed):', {
      profileId: profileLabel,
      emailType,
      dedupeKey,
      error: errorMessage,
    })
    return { allowed: false, reason: 'dedupe_error' }
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

