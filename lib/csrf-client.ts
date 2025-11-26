/**
 * Client-side CSRF token utilities
 * These functions run in the browser to read and send CSRF tokens
 */

const CSRF_TOKEN_COOKIE = 'csrf-token'
const CSRF_HEADER = 'x-csrf-token'

/**
 * Get CSRF token from cookies (client-side)
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null // Server-side, return null
  }

  // Always log for debugging (not just when debug flag is set)
  console.log('[CSRF_CLIENT] getCsrfToken called, checking cookies...')
  console.log('[CSRF_CLIENT] Full cookie string:', document.cookie)
  
  const cookies = document.cookie.split(';')
  console.log('[CSRF_CLIENT] Parsed cookies:', cookies.map(c => {
    const [name, value] = c.trim().split('=')
    return { name, hasValue: !!value, valueLength: value?.length }
  }))
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    console.log('[CSRF_CLIENT] Checking cookie:', { name, matches: name === CSRF_TOKEN_COOKIE })
    if (name === CSRF_TOKEN_COOKIE) {
      const token = decodeURIComponent(value)
      console.log('[CSRF_CLIENT] ✓ Found CSRF token in cookie:', {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 8) + '...',
        cookieName: name,
        fullToken: token, // Log full token for debugging
      })
      return token
    }
  }
  
  const allCookies = cookies.map(c => c.trim().split('=')[0])
  console.warn('[CSRF_CLIENT] ✗ CSRF token not found in cookies:', {
    availableCookies: allCookies,
    cookieString: document.cookie,
    lookingFor: CSRF_TOKEN_COOKIE,
  })
  return null
}

/**
 * Get headers object with CSRF token for fetch requests
 */
export function getCsrfHeaders(): Record<string, string> {
  console.log('[CSRF_CLIENT] getCsrfHeaders called')
  const token = getCsrfToken()
  if (!token) {
    // Log warning to help debug CSRF issues
    const availableCookies = typeof document !== 'undefined' 
      ? document.cookie.split(';').map(c => c.trim().split('=')[0])
      : []
    
    console.error('[CSRF_CLIENT] ✗ No CSRF token found - returning empty headers', {
      availableCookies,
      cookieString: typeof document !== 'undefined' ? document.cookie : 'N/A',
      documentCookieExists: typeof document !== 'undefined',
    })
    return {}
  }
  
  const headers = {
    [CSRF_HEADER]: token,
  }
  
  console.log('[CSRF_CLIENT] ✓ Returning CSRF headers:', {
    headerName: CSRF_HEADER,
    tokenLength: token.length,
    tokenPrefix: token.substring(0, 8) + '...',
    fullToken: token, // Log full token for debugging
    headersObject: headers,
  })
  
  return headers
}

