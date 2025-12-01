/**
 * Cron authentication helper
 * Validates x-cron-secret header authentication for scheduled job endpoints
 * 
 * Used by cron endpoints (e.g., Vercel Cron, Supabase Cron) to ensure
 * only authorized schedulers can trigger jobs.
 * 
 * Environment variable:
 * - CRON_SECRET: Shared secret token for cron authentication
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * Assert that the request is authorized with a valid CRON_SECRET in x-cron-secret header
 * Throws NextResponse with 401 if unauthorized
 * 
 * @param request - The incoming request
 * @throws NextResponse with 401 status if unauthorized
 */
export function assertCronAuthorized(request: NextRequest): void {
  const cronSecretHeader = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  // If no secret is configured, reject all requests (fail secure)
  if (!expectedSecret) {
    throw NextResponse.json(
      {
        ok: false,
        error: 'Cron authentication not configured',
        code: 'CRON_SECRET_NOT_SET',
      },
      { status: 500 }
    )
  }

  // Check for x-cron-secret header
  if (!cronSecretHeader || cronSecretHeader !== expectedSecret) {
    // Log warning without exposing the secret
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[CRON_AUTH] Unauthorized cron request attempt', {
        hasHeader: !!cronSecretHeader,
        headerLength: cronSecretHeader?.length || 0,
        expectedLength: expectedSecret.length,
      })
    }
    throw NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    )
  }
}

/**
 * Check if the request is authorized with a valid CRON_SECRET in x-cron-secret header
 * Returns true if authorized, false otherwise
 * 
 * @param request - The incoming request
 * @returns true if authorized, false otherwise
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const cronSecretHeader = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    return false
  }

  return cronSecretHeader === expectedSecret
}

