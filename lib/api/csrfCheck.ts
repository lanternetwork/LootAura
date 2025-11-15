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
  // Skip CSRF checks in test environment
  if (process.env.NODE_ENV === 'test') {
    return null
  }

  const pathname = request.nextUrl.pathname
  const method = request.method

  // Check if this route requires CSRF protection
  if (!requiresCsrf(pathname, method)) {
    return null // CSRF not required for this route
  }

  // Verify CSRF token
  try {
    if (!requireCsrfToken(request)) {
      logger.warn('CSRF token validation failed', {
        component: 'csrfCheck',
        operation: 'csrf_validation',
        path: pathname,
        method,
      })
      return fail(403, 'CSRF_INVALID', 'Invalid or missing CSRF token')
    }
  } catch (error) {
    // If cookies() can't be called (e.g., in test environment), skip CSRF check
    if (process.env.NODE_ENV === 'test' || error instanceof Error && error.message.includes('request scope')) {
      return null
    }
    throw error
  }

  return null // CSRF check passed
}

