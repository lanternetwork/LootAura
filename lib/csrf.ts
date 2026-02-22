import { cookies } from 'next/headers'

const CSRF_TOKEN_COOKIE = 'csrf-token'
const CSRF_HEADER = 'x-csrf-token'

/**
 * Generate a CSRF token using Web Crypto API (Edge-compatible)
 * 
 * Generates 32 random bytes and encodes them as a 64-character hex string.
 * This matches the previous Node crypto.randomBytes() output format for compatibility.
 */
export function generateCsrfToken(): string {
  // Use Web Crypto API (available in Edge runtime and Node.js)
  // Generate 32 random bytes (same as randomBytes(32))
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  
  // Convert to hex string (same format as randomBytes().toString('hex'))
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
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

  // Only log validation details in debug mode (skip in test environment)
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined
  const isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true'
  
  if (!isTestEnv && isDebug) {
    // Log only safe metadata, never full tokens or cookie strings
    const cookieNames = cookieHeader ? cookieHeader.split(';').map(c => {
      const [name] = c.trim().split('=')
      return name
    }) : []
    
    console.log('[CSRF] Validation check:', {
      hasHeader: !!tokenFromHeader,
      hasCookie: !!tokenFromCookie,
      headerTokenPrefix: tokenFromHeader ? tokenFromHeader.substring(0, 6) + '...' : null,
      cookieTokenPrefix: tokenFromCookie ? tokenFromCookie.substring(0, 6) + '...' : null,
      headerTokenLength: tokenFromHeader?.length,
      cookieTokenLength: tokenFromCookie?.length,
      cookieNames: cookieNames,
      // Never log full tokens, cookie values, or cookie header string
    })
    
    if (!tokenFromHeader || !tokenFromCookie) {
      console.error('[CSRF] ✗ Validation failed - missing token:', {
        hasHeader: !!tokenFromHeader,
        hasCookie: !!tokenFromCookie,
        // Never log token values
      })
    } else if (tokenFromHeader !== tokenFromCookie) {
      console.error('[CSRF] ✗ Validation failed - tokens do not match:', {
        headerTokenPrefix: tokenFromHeader.substring(0, 6) + '...',
        cookieTokenPrefix: tokenFromCookie.substring(0, 6) + '...',
        tokensMatch: tokenFromHeader === tokenFromCookie,
        tokenLengthsMatch: tokenFromHeader.length === tokenFromCookie.length,
        // Never log full tokens
      })
    } else {
      console.log('[CSRF] ✓ Validation passed - tokens match')
    }
  }

  if (!tokenFromHeader || !tokenFromCookie) {
    return false
  }

  return tokenFromHeader === tokenFromCookie
}

export function requireCsrfToken(request: Request): boolean {
  // Skip CSRF validation in test environments
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined
  if (isTestEnv) {
    return true
  }

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
