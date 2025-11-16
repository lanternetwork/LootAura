'use client'

import { useEffect } from 'react'

/**
 * Microsoft Clarity analytics integration
 * Loads Clarity script client-side only when NEXT_PUBLIC_CLARITY_ID is set
 */
export default function ClarityClient() {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') {
      return
    }

    // Get Clarity ID from environment variable
    const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID

    // If no Clarity ID, do nothing
    if (!clarityId || clarityId.trim() === '') {
      return
    }

    // Check if Clarity is already loaded to avoid duplicate injection
    if (window.clarity || document.querySelector(`script[data-clarity-id="${clarityId}"]`)) {
      return
    }

    // Inject Clarity script using the official Microsoft Clarity snippet
    // This uses the self-invoking function pattern from Clarity docs
    (function (c: any, l: any, a: any, r: any, i: any) {
      c[a] =
        c[a] ||
        function () {
          (c[a].q = c[a].q || []).push(arguments)
        }
      const t = l.createElement(r)
      t.async = 1
      t.src = 'https://www.clarity.ms/tag/' + i
      const y = l.getElementsByTagName(r)[0]
      y.parentNode.insertBefore(t, y)
    })(window, document, 'clarity', 'script', clarityId)

    // Mark that we've injected the script to prevent duplicates
    const script = document.querySelector(`script[src*="clarity.ms/tag/${clarityId}"]`)
    if (script) {
      script.setAttribute('data-clarity-id', clarityId)
    }
  }, [])

  // This component renders nothing
  return null
}

