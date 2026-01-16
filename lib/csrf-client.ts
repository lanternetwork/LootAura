/**
 * Client-side CSRF token utilities
 * These functions run in the browser to read and send CSRF tokens
 */

const CSRF_TOKEN_COOKIE = 'csrf-token'
const CSRF_HEADER = 'x-csrf-token'

// Track if we've logged initialization to reduce log volume
let hasLoggedInit = false

/**
 * Get CSRF token from cookies (client-side)
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null // Server-side, return null
  }

  const isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true'
  
  // Only log once per session when debug is enabled
  if (isDebug && !hasLoggedInit) {
    console.log('[CSRF_CLIENT] getCsrfToken called, checking cookies...')
    hasLoggedInit = true
  }
  
  const cookies = document.cookie.split(';')
  
  if (isDebug && !hasLoggedInit) {
    // Log only cookie names, never values
    const cookieNames = cookies.map(c => {
      const [name] = c.trim().split('=')
      return name
    })
    console.log('[CSRF_CLIENT] Available cookie names:', cookieNames)
  }
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === CSRF_TOKEN_COOKIE) {
      const token = decodeURIComponent(value)
      if (isDebug && !hasLoggedInit) {
        console.log('[CSRF_CLIENT] ✓ Found CSRF token in cookie:', {
          tokenLength: token.length,
          tokenPrefix: token.substring(0, 6) + '...',
          cookieName: name,
          // Never log full token
        })
      }
      return token
    }
  }
  
  if (isDebug) {
    // Log only cookie names, never values
    const cookieNames = cookies.map(c => {
      const [name] = c.trim().split('=')
      return name
    })
    console.warn('[CSRF_CLIENT] ✗ CSRF token not found in cookies:', {
      availableCookieNames: cookieNames,
      lookingFor: CSRF_TOKEN_COOKIE,
      // Never log cookie string or values
    })
  }
  return null
}

/**
 * Get headers object with CSRF token for fetch requests
 */
export function getCsrfHeaders(): Record<string, string> {
  const isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true'
  
  if (isDebug && !hasLoggedInit) {
    console.log('[CSRF_CLIENT] getCsrfHeaders called')
  }
  
  const token = getCsrfToken()
  if (!token) {
    if (isDebug) {
      const availableCookieNames = typeof document !== 'undefined' 
        ? document.cookie.split(';').map(c => c.trim().split('=')[0])
        : []
      
      console.error('[CSRF_CLIENT] ✗ No CSRF token found - returning empty headers', {
        availableCookieNames,
        documentCookieExists: typeof document !== 'undefined',
        // Never log cookie string or values
      })
    }
    return {}
  }
  
  const headers = {
    [CSRF_HEADER]: token,
  }
  
  if (isDebug && !hasLoggedInit) {
    console.log('[CSRF_CLIENT] ✓ Returning CSRF headers:', {
      headerName: CSRF_HEADER,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 6) + '...',
      // Never log full token or headers object
    })
  }
  
  return headers
}

