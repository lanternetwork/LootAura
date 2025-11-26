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

  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === CSRF_TOKEN_COOKIE) {
      const token = decodeURIComponent(value)
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[CSRF_CLIENT] Found CSRF token in cookie:', {
          tokenLength: token.length,
          tokenPrefix: token.substring(0, 8) + '...',
          cookieName: name,
        })
      }
      return token
    }
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const allCookies = cookies.map(c => c.trim().split('=')[0])
    console.warn('[CSRF_CLIENT] CSRF token not found in cookies:', {
      availableCookies: allCookies,
      cookieString: document.cookie.substring(0, 200),
    })
  }
  return null
}

/**
 * Get headers object with CSRF token for fetch requests
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  if (!token) {
    // Log warning to help debug CSRF issues
    const availableCookies = typeof document !== 'undefined' 
      ? document.cookie.split(';').map(c => c.trim().split('=')[0])
      : []
    
    console.warn('[CSRF_CLIENT] No CSRF token found in cookies.', {
      availableCookies,
      cookieString: typeof document !== 'undefined' ? document.cookie.substring(0, 200) : 'N/A'
    })
    return {}
  }
  
  const headers = {
    [CSRF_HEADER]: token,
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[CSRF_CLIENT] Returning CSRF headers:', {
      headerName: CSRF_HEADER,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 8) + '...',
    })
  }
  
  return headers
}

