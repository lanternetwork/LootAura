'use client'

import { useEffect, useRef } from 'react'

/**
 * Client-side component to ensure CSRF token cookie is set
 * This is a fallback in case the middleware doesn't set it properly
 */
export default function CsrfTokenInitializer() {
  const hasLoggedRef = useRef(false)
  
  useEffect(() => {
    const isDebug = process.env.NEXT_PUBLIC_DEBUG === 'true'
    
    // Only log once per component mount when debug is enabled
    if (isDebug && !hasLoggedRef.current) {
      console.log('[CSRF_INIT] Checking for CSRF token cookie...')
      hasLoggedRef.current = true
    }
    
    // Check if CSRF token cookie exists
    const cookies = document.cookie.split(';')
    let hasCsrfToken = false
    
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=')
      if (name === 'csrf-token') {
        hasCsrfToken = true
        const token = decodeURIComponent(value)
        if (isDebug && !hasLoggedRef.current) {
          console.log('[CSRF_INIT] ✓ Found CSRF token:', {
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 6) + '...',
            // Never log full token
          })
        }
        break
      }
    }

    // If no CSRF token, fetch from API to get one set
    if (!hasCsrfToken) {
      if (isDebug) {
        console.warn('[CSRF_INIT] ✗ No CSRF token found, fetching from API...')
      }
      // Make a simple GET request to trigger middleware to set the cookie
      fetch('/api/csrf-token', {
        method: 'GET',
        credentials: 'include',
      })
        .then(() => {
          if (isDebug) {
            console.log('[CSRF_INIT] ✓ CSRF token API call completed, checking cookie again...')
          }
          // Check again after a short delay
          setTimeout(() => {
            const newCookies = document.cookie.split(';')
            for (const cookie of newCookies) {
              const [name, value] = cookie.trim().split('=')
              if (name === 'csrf-token') {
                const token = decodeURIComponent(value)
                if (isDebug) {
                  console.log('[CSRF_INIT] ✓ CSRF token now available:', {
                    tokenLength: token.length,
                    tokenPrefix: token.substring(0, 6) + '...',
                    // Never log full token
                  })
                }
                return
              }
            }
            if (isDebug) {
              console.error('[CSRF_INIT] ✗ CSRF token still not found after API call')
            }
          }, 100)
        })
        .catch((error) => {
          if (isDebug) {
            console.error('[CSRF_INIT] ✗ Failed to initialize token via API:', error)
          }
        })
    }
  }, [])

  return null
}

