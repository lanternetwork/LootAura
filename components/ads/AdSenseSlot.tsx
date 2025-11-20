'use client'

import { useEffect, useState } from 'react'

interface AdSenseSlotProps {
  slot: string
  className?: string
  format?: string
  fullWidthResponsive?: boolean
  style?: React.CSSProperties
  id?: string
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>
  }
}

export default function AdSenseSlot({
  slot,
  className = '',
  format = 'auto',
  fullWidthResponsive = true,
  style,
  id,
}: AdSenseSlotProps) {
  const [isClient, setIsClient] = useState(false)
  const [adsEnabled, setAdsEnabled] = useState(false)

  useEffect(() => {
    setIsClient(true)
    // Check environment variable on client side
    const enabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'
    setAdsEnabled(enabled)
    
    // Debug logging (always log to help troubleshoot)
    console.log('[AdSense] Environment check:', {
      envValue: process.env.NEXT_PUBLIC_ENABLE_ADSENSE,
      enabled,
      slot,
      scriptExists: typeof window !== 'undefined' ? !!document.querySelector('script[src*="adsbygoogle.js"]') : false,
      adsbygoogleExists: typeof window !== 'undefined' ? !!window.adsbygoogle : false,
    })
  }, [slot])

  useEffect(() => {
    if (!isClient || !adsEnabled) return

    // Wait for AdSense script to load
    const initAd = () => {
      try {
        if (typeof window !== 'undefined' && window.adsbygoogle) {
          window.adsbygoogle.push({})
          
          if (process.env.NODE_ENV !== 'production') {
            console.log('[AdSense] Pushed ad for slot:', slot)
          }
          return true
        }
        return false
      } catch (error) {
        // Silently ignore errors to avoid crashing the page
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AdSense] Failed to push ad:', error)
        }
        return false
      }
    }

    // Check if script is already loaded
    if (typeof window !== 'undefined') {
      // Check if the script element exists and if it loaded successfully
      const scriptElement = document.querySelector('script[src*="adsbygoogle.js"]') as HTMLScriptElement
      
      // Check if script loaded successfully (not blocked)
      const scriptLoaded = scriptElement && (
        window.adsbygoogle !== undefined || 
        scriptElement.readyState === 'complete' || 
        scriptElement.readyState === 'loaded'
      )
      
      if (scriptLoaded && window.adsbygoogle) {
        // Script is loaded, initialize immediately
        initAd()
      } else if (scriptElement) {
        // Script tag exists but may be blocked or still loading
        // Wait for script to load - check multiple times
        let attempts = 0
        const maxAttempts = 30 // 3 seconds total (increased timeout)
        
        const checkAndInit = () => {
          attempts++
          
          if (window.adsbygoogle) {
            initAd()
          } else if (attempts < maxAttempts) {
            setTimeout(checkAndInit, 100)
          } else {
            // Script may be blocked by ad blocker
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[AdSense] Script did not load after 3 seconds for slot:', slot, {
                scriptElementExists: !!scriptElement,
                scriptSrc: scriptElement?.src,
                mayBeBlocked: true,
              })
            }
          }
        }
        
        // Listen for script load event
        if (scriptElement) {
          scriptElement.addEventListener('load', () => {
            if (window.adsbygoogle) {
              initAd()
            }
          })
          
          scriptElement.addEventListener('error', () => {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[AdSense] Script failed to load (may be blocked by ad blocker) for slot:', slot)
            }
          })
        }
        
        // Also start checking after a short delay as fallback
        const timer = setTimeout(checkAndInit, 200)
        return () => clearTimeout(timer)
      } else {
        // Script element doesn't exist yet, wait a bit
        const timer = setTimeout(() => {
          const script = document.querySelector('script[src*="adsbygoogle.js"]')
          if (script && window.adsbygoogle) {
            initAd()
          }
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [isClient, adsEnabled, slot])

  if (!adsEnabled) {
    return null
  }

  if (!isClient) {
    // Return a placeholder to avoid hydration issues
    return (
      <div
        className={className}
        style={{ minHeight: '100px', ...style }}
        suppressHydrationWarning
      />
    )
  }

  return (
    <div className={className} style={{ minHeight: '100px', ...style }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', ...style }}
        data-ad-client="ca-pub-8685093412475036"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
        {...(id && { id })}
        suppressHydrationWarning
      />
    </div>
  )
}

