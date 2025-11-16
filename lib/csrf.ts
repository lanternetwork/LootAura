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
  const tokenFromCookie = getCsrfToken()

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
