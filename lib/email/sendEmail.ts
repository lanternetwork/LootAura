/**
 * Generic email sending helper
 * Server-only module
 */

import { ReactElement } from 'react'
import { getResendClient } from './client'
import type { EmailType, EmailSendOptions } from './types'

export interface SendEmailParams extends EmailSendOptions {
  react: ReactElement
}

/**
 * Send an email via Resend
 * 
 * - Honors LOOTAURA_ENABLE_EMAILS env var (skips send if not "true")
 * - Logs errors but does not throw (emails are non-critical side effects)
 * - Returns void (fire-and-forget pattern)
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, react, type, metadata } = params

  // Check if emails are enabled
  const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
  
  if (!emailsEnabled) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL] Skipping email send (LOOTAURA_ENABLE_EMAILS not enabled):', {
        type,
        to,
        subject,
      })
    }
    return
  }

  // Get from address
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!fromEmail) {
    const error = new Error('RESEND_FROM_EMAIL is not set')
    console.error('[EMAIL] Configuration error:', {
      type,
      to,
      error: error.message,
    })
    return
  }

  try {
    const resend = getResendClient()
    
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      react,
      headers: {
        'X-Lootaura-Email-Type': type,
      },
    })

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EMAIL] Email sent successfully:', {
        type,
        to,
        subject,
        id: result.data?.id,
        metadata,
      })
    }
  } catch (error) {
    // Log structured error but don't throw - emails are non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL] Failed to send email:', {
      type,
      to,
      subject,
      error: errorMessage,
      metadata,
    })

    // Optionally log to Sentry if available
    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.captureException(error instanceof Error ? error : new Error(errorMessage), {
        tags: {
          component: 'email',
          emailType: type,
        },
        extra: {
          to,
          subject,
          metadata,
        },
      })
    } catch {
      // Sentry not available or failed to import - ignore
    }
  }
}

