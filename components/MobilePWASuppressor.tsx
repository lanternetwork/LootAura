'use client'

import { useEffect } from 'react'

/**
 * Suppresses the browser's native PWA install prompt on mobile devices only.
 * 
 * This prevents the install prompt UI from reserving space in the visual viewport
 * on mobile, which interferes with map interaction and reveals empty space below the map.
 * 
 * Desktop behavior is unchanged - the install prompt will work normally on desktop.
 */
export default function MobilePWASuppressor() {
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return

    // Detect mobile device using the same logic as PWAInstallPrompt
    const isMobile = () => {
      return window.innerWidth < 768 || 
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    }

    // Only suppress on mobile devices
    if (!isMobile()) {
      return // Desktop: do nothing, allow normal PWA install prompt behavior
    }

    // Mobile: intercept and suppress the install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the browser's native install prompt from appearing
      e.preventDefault()
      // Do NOT store the event
      // Do NOT re-trigger it later
      // Just suppress it permanently on mobile
    }

    // Register the event listener with capture phase to intercept before other handlers
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt, { capture: true })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt, { capture: true })
    }
  }, [])

  // This component doesn't render anything
  return null
}
