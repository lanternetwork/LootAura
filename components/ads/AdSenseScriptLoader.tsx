'use client'

import { useEffect } from 'react'

/**
 * AdSense Script Loader
 * Injects the AdSense script directly into the <head> to avoid Next.js Script component
 * attributes that AdSense doesn't support (like data-nscript)
 */
export default function AdSenseScriptLoader() {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') {
      return
    }

    // Check if ads are enabled
    const adsEnabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'
    
    if (!adsEnabled) {
      return
    }

    // Check if script is already loaded
    if (document.querySelector('script[src*="adsbygoogle.js"]')) {
      return
    }

    // Inject AdSense script directly into head (as AdSense recommends)
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8685093412475036'
    script.crossOrigin = 'anonymous'
    script.id = 'adsense-loader'
    
    // Insert into head
    document.head.appendChild(script)

    // Cleanup function (though we typically don't remove scripts)
    return () => {
      const existingScript = document.getElementById('adsense-loader')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [])

  // This component renders nothing
  return null
}

