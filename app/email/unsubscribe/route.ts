/**
 * GET /email/unsubscribe
 * 
 * One-click unsubscribe endpoint for non-administrative emails.
 * No authentication required - uses secure token-based verification.
 * 
 * Query parameter: token (string) - The unsubscribe token from the email
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { Policies } from '@/lib/rateLimit/policies'
import { deriveKey } from '@/lib/rateLimit/keys'
import { check } from '@/lib/rateLimit/limiter'
import { shouldBypassRateLimit } from '@/lib/rateLimit/config'

const isTestEnv = process.env.NODE_ENV === 'test'

function logUnsubscribeError(message: string, context?: Record<string, unknown>) {
  const formatted = context ? `${message} ${JSON.stringify(context)}` : message
  if (isTestEnv) {
    console.warn(formatted)
  } else {
    console.error(formatted)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // Use Node.js runtime (not Edge) for Supabase service role

/**
 * Generate HTML response for unsubscribe page
 */
function generateUnsubscribePage(
  success: boolean,
  message: string,
  alreadyUnsubscribed: boolean = false
): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? 'Unsubscribed' : 'Unsubscribe Error'} - LootAura</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #3A2268;
      margin-top: 0;
      font-size: 24px;
    }
    p {
      margin: 16px 0;
      color: #666;
    }
    .success {
      color: #22c55e;
    }
    .error {
      color: #ef4444;
    }
    a {
      color: #3A2268;
      text-decoration: underline;
    }
    a:hover {
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${success ? '✓ Unsubscribed' : 'Unsubscribe Error'}</h1>
    <p class="${success ? 'success' : 'error'}">${message}</p>
    ${success ? `
      <p>You've been unsubscribed from all non-administrative emails from LootAura.</p>
      <p>You will still receive essential emails about your account and transactions.</p>
      ${alreadyUnsubscribed ? '<p><em>Note: You were already unsubscribed from these emails.</em></p>' : ''}
      <p>You can update your preferences any time in your <a href="${baseUrl}/account/edit">account settings</a>.</p>
    ` : `
      <p>This unsubscribe link is invalid or has expired.</p>
      <p>If you continue to receive emails, please contact support or update your preferences in your <a href="${baseUrl}/account/edit">account settings</a>.</p>
    `}
  </div>
</body>
</html>`
}

async function handleUnsubscribe(request: NextRequest): Promise<NextResponse> {
  try {
    // Extract token from query parameters
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    
    // Validate token parameter
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return new NextResponse(
        generateUnsubscribePage(
          false,
          'Invalid unsubscribe link. The token is missing or malformed.'
        ),
        {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      )
    }
    
    const adminDb = getAdminDb()
    const now = new Date().toISOString()
    
    // Look up token in database
    // Token must be:
    // - Matching the provided token
    // - Not expired (expires_at >= now)
    // - Not already used (used_at IS NULL)
    // - Scope = 'all_non_admin'
    const { data: tokenRow, error: lookupError } = await fromBase(adminDb, 'email_unsubscribe_tokens')
      .select('profile_id, used_at, expires_at')
      .eq('token', token.trim())
      .eq('scope', 'all_non_admin')
      .is('used_at', null)
      .gte('expires_at', now)
      .maybeSingle()
    
    if (lookupError) {
      // Log error but don't expose details to user
      logUnsubscribeError('[UNSUBSCRIBE] Error looking up token', {
        error: lookupError.message,
      })
      
      return new NextResponse(
        generateUnsubscribePage(
          false,
          'An error occurred while processing your unsubscribe request. Please try again later or update your preferences in your account settings.'
        ),
        {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      )
    }
    
    // Check if token was found and is valid
    if (!tokenRow) {
      // Token not found, expired, or already used
      // Check if it was already used (for better UX message)
      const { data: usedToken } = await fromBase(adminDb, 'email_unsubscribe_tokens')
        .select('used_at')
        .eq('token', token.trim())
        .maybeSingle()
      
      const alreadyUsed = usedToken?.used_at !== null
      
      return new NextResponse(
        generateUnsubscribePage(
          false,
          alreadyUsed
            ? 'This unsubscribe link has already been used.'
            : 'This unsubscribe link is invalid or has expired.'
        ),
        {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      )
    }
    
    const { profile_id } = tokenRow
    
    // Check if user is already unsubscribed (for better UX)
    const { data: profile } = await fromBase(adminDb, 'profiles')
      .select('email_favorites_digest_enabled, email_seller_weekly_enabled')
      .eq('id', profile_id)
      .maybeSingle()
    
    const alreadyUnsubscribed = 
      profile?.email_favorites_digest_enabled === false &&
      profile?.email_seller_weekly_enabled === false
    
    // Update profile to unsubscribe from all non-admin emails
    const { error: updateError } = await fromBase(adminDb, 'profiles')
      .update({
        email_favorites_digest_enabled: false,
        email_seller_weekly_enabled: false,
      })
      .eq('id', profile_id)
    
    if (updateError) {
      logUnsubscribeError('[UNSUBSCRIBE] Error updating profile preferences', {
        profileId: profile_id,
        error: updateError.message,
      })
      
      return new NextResponse(
        generateUnsubscribePage(
          false,
          'An error occurred while updating your preferences. Please try again later or update your preferences in your account settings.'
        ),
        {
          status: 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      )
    }
    
    // Mark token as used
    const { error: markUsedError } = await fromBase(adminDb, 'email_unsubscribe_tokens')
      .update({ used_at: now })
      .eq('token', token.trim())
    
    if (markUsedError) {
      // Log but don't fail - preferences were already updated
      logUnsubscribeError('[UNSUBSCRIBE] Error marking token as used', {
        error: markUsedError.message,
      })
    }
    
    // Success - return confirmation page
    return new NextResponse(
      generateUnsubscribePage(
        true,
        'You have been successfully unsubscribed.',
        alreadyUnsubscribed
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    )
  } catch (error) {
    // Catch-all error handler
    const errorMessage = error instanceof Error ? error.message : String(error)
    logUnsubscribeError('[UNSUBSCRIBE] Unexpected error', { error: errorMessage })
    
    return new NextResponse(
      generateUnsubscribePage(
        false,
        'An unexpected error occurred. Please try again later or update your preferences in your account settings.'
      ),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    )
  }
}

/**
 * Rate-limited GET handler for unsubscribe endpoint
 * Returns HTML error page on rate limit instead of JSON
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check rate limiting (bypass if disabled)
  if (!shouldBypassRateLimit()) {
    const policy = Policies.UNSUBSCRIBE_EMAIL
    const key = await deriveKey(request, policy.scope)
    const result = await check(policy, key)
    
    if (!result.allowed) {
      // Log rate-limited requests (non-PII: route path, policy only)
      const { logger } = await import('@/lib/log')
      logger.warn('Unsubscribe request rate-limited', {
        component: 'rateLimit',
        operation: 'rate_limit_exceeded',
        policy: policy.name,
        scope: policy.scope,
        path: request.nextUrl.pathname,
        remaining: result.remaining
      })
      
      // Return HTML error page for rate limit
      return new NextResponse(
        generateUnsubscribePage(
          false,
          'Too many unsubscribe requests from your network. Please try again later.'
        ),
        {
          status: 429,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      )
    }
  }
  
  // Call the actual handler
  return handleUnsubscribe(request)
}
