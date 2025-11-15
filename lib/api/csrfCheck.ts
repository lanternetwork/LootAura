/**
 * CSRF check helper for API routes
 * Use this at the start of mutation handlers to verify CSRF tokens
 */

import { NextRequest } from 'next/server'
import { requireCsrfToken } from '@/lib/csrf'
import { requiresCsrf } from './csrfRoutes'
import { fail } from '@/lib/http/json'
import { logger } from '@/lib/log'

/**
 * Check CSRF token for a request if required
 * Returns a failure response if CSRF check fails, null if check passes
 * @param request - The incoming request
 * @returns Error response if CSRF check fails, null if check passes or not required
 */
export async function checkCsrfIfRequired(request: NextRequest): Promise<ReturnType<typeof fail> | null> {
  const pathname = request.nextUrl.pathname
  const method = request.method

  // Check if this route requires CSRF protection
  if (!requiresCsrf(pathname, method)) {
    return null // CSRF not required for this route
  }

  // Verify CSRF token
  if (!requireCsrfToken(request)) {
    logger.warn('CSRF token validation failed', {
      component: 'csrfCheck',
      operation: 'csrf_validation',
      path: pathname,
      method,
    })
    return fail(403, 'CSRF_INVALID', 'Invalid or missing CSRF token')
  }

  return null // CSRF check passed
}

