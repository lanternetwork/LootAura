/**
 * Moderation weekly digest email sending function
 * Server-only module
 */

import React from 'react'
import { sendEmail } from './sendEmail'
import { ModerationDailyDigestEmail, buildModerationDigestSubject, type ReportDigestItem } from './templates/ModerationDailyDigestEmail'
import { canSendEmail, recordEmailSend } from './emailLog'
import { getWeekKey } from '@/lib/featured-email/selection'

export interface SendModerationDailyDigestEmailParams {
  reports: ReportDigestItem[]
  dateWindow: string
  baseUrl?: string
}

/**
 * Send moderation weekly digest email to admin
 * @param params - Email parameters
 * @returns Result with ok status and optional error
 */
export async function sendModerationDailyDigestEmail(
  params: SendModerationDailyDigestEmailParams
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { reports, dateWindow, baseUrl = 'https://lootaura.com' } = params

  // Require MODERATION_DIGEST_EMAIL to be set (fail closed if missing)
  const toEmail = process.env.MODERATION_DIGEST_EMAIL
  if (!toEmail) {
    // Log warning (non-PII) and skip sending
    const { logger } = await import('@/lib/log')
    logger.warn('Moderation digest email skipped - MODERATION_DIGEST_EMAIL not configured', {
      component: 'email',
      operation: 'moderation_digest',
      reportCount: reports.length,
    })
    return {
      ok: false,
      error: 'MODERATION_DIGEST_EMAIL not configured',
    }
  }

  const weekDedupeKey = `moderation_digest_${getWeekKey(new Date())}`
  const dedupeGate = await canSendEmail({
    profileId: null,
    emailType: 'moderation_daily_digest',
    dedupeKey: weekDedupeKey,
    lookbackWindow: '14 days',
  })

  if (!dedupeGate.allowed) {
    const { logger } = await import('@/lib/log')
    if (dedupeGate.reason === 'duplicate') {
      logger.info('Moderation digest skipped — already sent this week', {
        component: 'email',
        operation: 'moderation_digest',
        dedupeKey: weekDedupeKey,
      })
      return { ok: true, skipped: true }
    }
    logger.warn('Moderation digest skipped — dedupe check failed (fail closed)', {
      component: 'email',
      operation: 'moderation_digest',
      dedupeKey: weekDedupeKey,
    })
    return { ok: false, error: 'Dedupe check failed; moderation digest not sent' }
  }

  const subject = buildModerationDigestSubject(reports.length)

  try {
    const react = React.createElement(ModerationDailyDigestEmail, {
      reports,
      dateWindow,
      baseUrl,
    })

    const result = await sendEmail({
      to: toEmail,
      subject,
      type: 'moderation_daily_digest',
      react,
      metadata: {
        reportCount: reports.length,
        dateWindow,
      },
    })

    // Record email send (always record, even on failure)
    await recordEmailSend({
      emailType: 'moderation_daily_digest',
      toEmail,
      subject,
      dedupeKey: weekDedupeKey,
      deliveryStatus: result.ok ? 'sent' : 'failed',
      errorMessage: result.error,
      meta: {
        reportCount: reports.length,
        dateWindow,
        ...(result.resendEmailId && { resendEmailId: result.resendEmailId }),
      },
    })

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Record failed send
    await recordEmailSend({
      emailType: 'moderation_daily_digest',
      toEmail,
      subject,
      dedupeKey: weekDedupeKey,
      deliveryStatus: 'failed',
      errorMessage,
      meta: {
        reportCount: reports.length,
        dateWindow,
        // Note: resendEmailId not available on failure (email was never sent)
      },
    })

    return {
      ok: false,
      error: errorMessage,
    }
  }
}

