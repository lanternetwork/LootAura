/**
 * Resend email client
 * Server-only module for sending transactional emails
 */

import { Resend } from 'resend'

let resendClient: Resend | null = null

/**
 * Get or create Resend client instance (singleton)
 * Throws if RESEND_API_KEY is not configured
 */
export function getResendClient(): Resend {
  if (resendClient) {
    return resendClient
  }

  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set; emails cannot be sent. ' +
      'Please configure RESEND_API_KEY in your environment variables.'
    )
  }

  resendClient = new Resend(apiKey)
  return resendClient
}

