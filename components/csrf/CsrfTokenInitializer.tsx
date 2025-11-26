'use client'

import { useEffect } from 'react'

/**
 * Client-side component to ensure CSRF token cookie is set
 * This is a fallback in case the middleware doesn't set it properly
 */
export default function CsrfTokenInitializer() {
  useEffect(() => {
    console.log('[CSRF_INIT] Checking for CSRF token cookie...')
    console.log('[CSRF_INIT] Full cookie string:', document.cookie)
    
    // Check if CSRF token cookie exists
    const cookies = document.cookie.split(';')
    let hasCsrfToken = false
    let csrfTokenValue = null
    
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=')
      console.log('[CSRF_INIT] Checking cookie:', { name, hasValue: !!value })
      if (name === 'csrf-token') {
        hasCsrfToken = true
        csrfTokenValue = decodeURIComponent(value)
        console.log('[CSRF_INIT] ✓ Found CSRF token:', {
          tokenLength: csrfTokenValue.length,
          tokenPrefix: csrfTokenValue.substring(0, 8) + '...',
        })
        break
      }
    }

    // If no CSRF token, fetch from API to get one set
    if (!hasCsrfToken) {
      console.warn('[CSRF_INIT] ✗ No CSRF token found, fetching from API...')
      // Make a simple GET request to trigger middleware to set the cookie
      fetch('/api/csrf-token', {
        method: 'GET',
        credentials: 'include',
      })
        .then(() => {
          console.log('[CSRF_INIT] ✓ CSRF token API call completed, checking cookie again...')
          // Check again after a short delay
          setTimeout(() => {
            const newCookies = document.cookie.split(';')
            for (const cookie of newCookies) {
              const [name, value] = cookie.trim().split('=')
              if (name === 'csrf-token') {
                console.log('[CSRF_INIT] ✓ CSRF token now available:', {
                  tokenLength: decodeURIComponent(value).length,
                  tokenPrefix: decodeURIComponent(value).substring(0, 8) + '...',
                })
                return
              }
            }
            console.error('[CSRF_INIT] ✗ CSRF token still not found after API call')
          }, 100)
        })
        .catch((error) => {
          console.error('[CSRF_INIT] ✗ Failed to initialize token via API:', error)
        })
    }
  }, [])

  return null
}

