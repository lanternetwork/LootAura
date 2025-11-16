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
      return decodeURIComponent(value)
    }
  }
  return null
}

/**
 * Get headers object with CSRF token for fetch requests
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  if (!token) {
    return {}
  }
  return {
    [CSRF_HEADER]: token,
  }
}

