/**
 * Generic email sending helper
 * Server-only module
 */

import { ReactElement } from 'react'
import { getResendClient } from './client'
import { redactEmailForLogging, redactMetadataForLogging } from './logging'
import type { EmailSendOptions } from './types'

export interface SendEmailParams extends EmailSendOptions {
  react: ReactElement
}

export interface SendEmailResult {
  ok: boolean
  error?: string
}

/**
 * Send an email via Resend
 * 
 * - Honors LOOTAURA_ENABLE_EMAILS env var (skips send if not "true")
 * - Logs errors but does not throw (emails are non-critical side effects)
 * - Returns a structured result for diagnostics (`{ ok, error? }`)
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, react, type, metadata } = params

  // Check if emails are enabled
  const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
  
  if (!emailsEnabled) {
    // Always log this - it's important for debugging
    console.log('[EMAIL] Skipping email send (LOOTAURA_ENABLE_EMAILS not enabled):', {
      type,
      to: redactEmailForLogging(to),
      subject,
      actualValue: process.env.LOOTAURA_ENABLE_EMAILS,
      expectedValue: 'true',
    })
    return {
      ok: false,
      error: 'LOOTAURA_ENABLE_EMAILS is not enabled',
    }
  }

  // Get from address (check RESEND_FROM_EMAIL first, fallback to EMAIL_FROM for backward compatibility)
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM
  if (!fromEmail) {
    const error = new Error('RESEND_FROM_EMAIL (or EMAIL_FROM) is not set')
    console.error('[EMAIL] Configuration error:', {
      type,
      to: redactEmailForLogging(to),
      error: error.message,
      checkedVars: {
        hasResendFromEmail: !!process.env.RESEND_FROM_EMAIL,
        hasEmailFrom: !!process.env.EMAIL_FROM,
      },
    })
    return {
      ok: false,
      error: error.message,
    }
  }

  // Format from address with sender name: "Loot Aura" <email@example.com>
  // If fromEmail already includes a name (contains <), use it as-is; otherwise add "Loot Aura"
  const fromAddress = fromEmail.includes('<') 
    ? fromEmail 
    : `"Loot Aura" <${fromEmail}>`

  try {
    // Log before attempting to send (always, not just in debug mode)
    console.log('[EMAIL] Attempting to send email via Resend:', {
      type,
      to: redactEmailForLogging(to),
      subject,
      from: fromAddress,
      hasResendApiKey: !!process.env.RESEND_API_KEY,
    })
    
    const resend = getResendClient()
    
    const result = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      react,
      headers: {
        'X-Lootaura-Email-Type': type,
      },
    })

    // Always log success (not just in debug mode) - this confirms it reached Resend
    console.log('[EMAIL] Email sent successfully via Resend:', {
      type,
      to: redactEmailForLogging(to),
      subject,
      resendEmailId: result.data?.id,
      metadata: redactMetadataForLogging(metadata),
    })
    return { ok: true }
  } catch (error) {
    // Log structured error but don't throw - emails are non-critical
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[EMAIL] Failed to send email:', {
      type,
      to: redactEmailForLogging(to),
      subject,
      error: errorMessage,
      metadata: redactMetadataForLogging(metadata),
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
          to: redactEmailForLogging(to),
          subject,
          metadata: redactMetadataForLogging(metadata),
        },
      })
    } catch {
      // Sentry not available or failed to import - ignore
    }

    return {
      ok: false,
      error: errorMessage,
    }
  }
}

