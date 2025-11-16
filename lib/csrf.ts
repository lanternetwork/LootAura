import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

const CSRF_TOKEN_COOKIE = 'csrf-token'
const CSRF_HEADER = 'x-csrf-token'

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

export function setCsrfToken(token: string): void {
  const cookieStore = cookies()
  // CSRF token must be readable by client-side JavaScript to send in x-csrf-token header
  // Security is maintained by validating that header token matches cookie token
  cookieStore.set(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false, // Must be readable by client to send in header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/'
  })
}

export function getCsrfToken(): string | null {
  const cookieStore = cookies()
  return cookieStore.get(CSRF_TOKEN_COOKIE)?.value || null
}

export function validateCsrfToken(request: Request): boolean {
  const tokenFromHeader = request.headers.get(CSRF_HEADER)
  
  // Read cookie from request header (works in API routes)
  const cookieHeader = request.headers.get('cookie')
  let tokenFromCookie: string | null = null
  
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim())
    for (const cookie of cookies) {
      const equalIndex = cookie.indexOf('=')
      if (equalIndex === -1) continue
      const name = cookie.substring(0, equalIndex).trim()
      const value = cookie.substring(equalIndex + 1).trim()
      if (name === CSRF_TOKEN_COOKIE) {
        tokenFromCookie = decodeURIComponent(value)
        break
      }
    }
  }
  
  // Fallback: try cookies() if available (for server components)
  if (!tokenFromCookie) {
    try {
      tokenFromCookie = getCsrfToken()
    } catch {
      // cookies() not available in this context, that's okay
    }
  }

  // Debug logging in development (skip in test environment)
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined
  if (!isTestEnv && (process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV !== 'production')) {
    if (!tokenFromHeader || !tokenFromCookie) {
      console.warn('[CSRF] Validation failed:', {
        hasHeader: !!tokenFromHeader,
        hasCookie: !!tokenFromCookie,
        cookieHeader: cookieHeader ? cookieHeader.substring(0, 100) : null,
        cookieNames: cookieHeader ? cookieHeader.split(';').map(c => c.trim().split('=')[0]) : []
      })
    }
  }

  if (!tokenFromHeader || !tokenFromCookie) {
    return false
  }

  return tokenFromHeader === tokenFromCookie
}

export function requireCsrfToken(request: Request): boolean {
  // Skip CSRF validation for GET requests
  if (request.method === 'GET') {
    return true
  }

  // Skip CSRF validation for Supabase requests (they handle their own auth)
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/auth/') || 
      url.pathname.startsWith('/api/supabase/')) {
    return true
  }

  return validateCsrfToken(request)
}
