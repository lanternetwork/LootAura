/**
 * Unsubscribe token generation and management
 * Server-only module
 */

import { randomBytes } from 'crypto'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(): string {
  // Generate 32 random bytes (256 bits) and convert to hex string
  return randomBytes(32).toString('hex')
}

/**
 * Create an unsubscribe token for a user profile
 * 
 * @param profileId - The user's profile ID (same as user ID in Supabase)
 * @returns The generated token string (for use in unsubscribe URL)
 */
export async function createUnsubscribeToken(profileId: string): Promise<string> {
  const token = generateSecureToken()
  const adminDb = getAdminDb()
  
  // Calculate expiration date (30 days from now)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  
  // Insert token into database using service role (bypasses RLS)
  const { error } = await fromBase(adminDb, 'email_unsubscribe_tokens').insert({
    profile_id: profileId,
    token,
    scope: 'all_non_admin',
    expires_at: expiresAt.toISOString(),
  })
  
  if (error) {
    // Log error but don't expose token in logs
    console.error('[UNSUBSCRIBE_TOKEN] Failed to create unsubscribe token:', {
      profileId,
      error: error.message,
      errorCode: error.code,
      errorDetails: error.details,
    })
    throw new Error(`Failed to create unsubscribe token: ${error.message}`)
  }
  
  return token
}

/**
 * Build unsubscribe URL from token
 * 
 * @param token - The unsubscribe token
 * @param baseUrl - Base URL of the site (defaults to NEXT_PUBLIC_SITE_URL)
 * @returns Full unsubscribe URL
 */
export function buildUnsubscribeUrl(token: string, baseUrl?: string): string {
  const siteUrl = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
  return `${siteUrl.replace(/\/$/, '')}/email/unsubscribe?token=${encodeURIComponent(token)}`
}
