/**
 * Moderation weekly digest email sending function
 * Server-only module
 */

import React from 'react'
import { sendEmail } from './sendEmail'
import { ModerationDailyDigestEmail, buildModerationDigestSubject, type ReportDigestItem } from './templates/ModerationDailyDigestEmail'
import { recordEmailSend } from './emailLog'
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
): Promise<{ ok: boolean; error?: string }> {
  const { reports, dateWindow, baseUrl = 'https://lootaura.com' } = params

  const toEmail = process.env.MODERATION_DIGEST_EMAIL || 'lanternetwork@gmail.com'
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
      dedupeKey: `moderation_digest_${getWeekKey(new Date())}`, // One per week
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
      dedupeKey: `moderation_digest_${getWeekKey(new Date())}`,
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

