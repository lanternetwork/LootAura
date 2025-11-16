'use client'

import { useEffect } from 'react'

/**
 * Client-side component to ensure CSRF token cookie is set
 * This is a fallback in case the middleware doesn't set it properly
 */
export default function CsrfTokenInitializer() {
  useEffect(() => {
    // Check if CSRF token cookie exists
    const cookies = document.cookie.split(';')
    let hasCsrfToken = false
    for (const cookie of cookies) {
      const [name] = cookie.trim().split('=')
      if (name === 'csrf-token') {
        hasCsrfToken = true
        break
      }
    }

    // If no CSRF token, fetch from API to get one set
    if (!hasCsrfToken) {
      // Make a simple GET request to trigger middleware to set the cookie
      fetch('/api/csrf-token', {
        method: 'GET',
        credentials: 'include',
      }).catch((error) => {
        // Silently fail - this is just a best-effort fallback
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[CSRF] Failed to initialize token via API:', error)
        }
      })
    }
  }, [])

  return null
}

