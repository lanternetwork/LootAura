/**
 * Resend Webhook Utilities
 * Server-only module for webhook signature verification
 * 
 * Resend uses Svix-based webhook signing with HMAC-SHA256
 */

import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto'
import { ENV_SERVER } from '@/lib/env'

/**
 * Get Resend webhook secret
 * 
 * @throws Error if RESEND_WEBHOOK_SECRET is not configured (treats as misconfig)
 * @returns The webhook secret string
 */
export function getResendWebhookSecret(): string {
  const secret = ENV_SERVER.RESEND_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('RESEND_WEBHOOK_SECRET is not configured. Webhook signature verification requires this secret.')
  }
  return secret
}

/**
 * Verify Resend webhook signature using Svix format
 * 
 * Resend/Svix signature format:
 * - Headers: svix-id, svix-timestamp, svix-signature
 * - Signature is HMAC-SHA256 of: `${timestamp}.${payload}`
 * - Signature header can contain multiple signatures (space-separated)
 * - Each signature format: v1,<hex-signature>
 * 
 * @param payload - Raw request body as string
 * @param headers - Request headers containing svix-id, svix-timestamp, svix-signature
 * @param secret - Webhook secret from environment
 * @returns true if signature is valid
 */
export function verifyResendWebhookSignature(
  payload: string,
  headers: {
    'svix-id'?: string | null
    'svix-timestamp'?: string | null
    'svix-signature'?: string | null
  },
  secret: string
): boolean {
  try {
    const svixId = headers['svix-id']
    const svixTimestamp = headers['svix-timestamp']
    const svixSignature = headers['svix-signature']
    
    // All headers are required
    if (!svixId || !svixTimestamp || !svixSignature) {
      return false
    }
    
    // Verify timestamp is within acceptable window (±5 minutes)
    const timestamp = parseInt(svixTimestamp, 10)
    if (isNaN(timestamp)) {
      return false
    }
    
    const now = Math.floor(Date.now() / 1000)
    const window = 300 // 5 minutes in seconds
    if (Math.abs(timestamp - now) > window) {
      return false
    }
    
    // Parse signature header (can contain multiple signatures separated by spaces)
    // Each signature format: v1,<hex-signature>
    const signatures = svixSignature.split(' ')
    
    // Compute expected signature: HMAC-SHA256(timestamp + '.' + payload)
    const signedPayload = `${svixTimestamp}.${payload}`
    const hmac = createHmac('sha256', secret)
    hmac.update(signedPayload)
    const expectedSignature = hmac.digest('hex')
    
    // Check if any signature matches (Svix can send multiple for different timestamps)
    for (const signature of signatures) {
      const parts = signature.split(',')
      if (parts.length !== 2 || parts[0] !== 'v1') {
        continue
      }
      
      const signatureValue = parts[1]
      
      // Use constant-time comparison to prevent timing attacks
      if (cryptoTimingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(signatureValue, 'hex'))) {
        return true
      }
    }
    
    return false
  } catch (error) {
    // If verification fails for any reason, reject
    return false
  }
}
