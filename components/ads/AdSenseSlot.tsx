'use client'

import { useEffect, useState, useRef } from 'react'

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
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const hasPushedRef = useRef(false) // Track if we've already pushed this ad

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
      // Prevent duplicate pushes (AdSense doesn't allow pushing the same slot twice)
      if (hasPushedRef.current) {
        return false
      }
      
      try {
        if (typeof window !== 'undefined' && window.adsbygoogle) {
          // Verify the ad slot element exists in the DOM before pushing
          const adElement = document.querySelector(`ins[data-ad-slot="${slot}"]`)
          if (!adElement) {
            console.warn('[AdSense] Ad slot element not found in DOM for slot:', slot)
            return false
          }
          
          // Check if this element already has an ad (AdSense may have auto-initialized it)
          if ((adElement as HTMLElement).hasAttribute('data-adsbygoogle-status')) {
            console.log('[AdSense] Ad slot already initialized by AdSense for slot:', slot)
            hasPushedRef.current = true
            return true
          }
          
          window.adsbygoogle.push({})
          hasPushedRef.current = true // Mark as pushed
          
          // Always log to help with debugging
          console.log('[AdSense] Pushed ad for slot:', slot, {
            elementFound: !!adElement,
            elementId: adElement?.id || 'none',
            clientId: (adElement as HTMLElement)?.getAttribute('data-ad-client'),
            slotId: (adElement as HTMLElement)?.getAttribute('data-ad-slot'),
            format: (adElement as HTMLElement)?.getAttribute('data-ad-format'),
            className: adElement?.className,
            isVisible: (adElement as HTMLElement)?.offsetParent !== null,
            dimensions: {
              width: (adElement as HTMLElement)?.offsetWidth,
              height: (adElement as HTMLElement)?.offsetHeight,
            },
          })
          
          // Check ad status after a delay to see if AdSense processed it
          setTimeout(() => {
            const status = (adElement as HTMLElement)?.getAttribute('data-adsbygoogle-status')
            const innerHTML = (adElement as HTMLElement)?.innerHTML || ''
            const hasIframe = innerHTML.includes('<iframe')
            const hasAdContent = innerHTML.length > 0
            
            console.log('[AdSense] Ad status after push for slot:', slot, {
              status: status || 'not set',
              hasAdContent,
              hasIframe,
              innerHTMLLength: innerHTML.length,
              innerHTMLPreview: innerHTML.substring(0, 200),
              elementVisible: (adElement as HTMLElement)?.offsetParent !== null,
              elementDimensions: {
                width: (adElement as HTMLElement)?.offsetWidth,
                height: (adElement as HTMLElement)?.offsetHeight,
              },
            })
          }, 2000)
          
          return true
        }
        return false
      } catch (error) {
        // Check if error is because ad was already pushed
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('already have ads')) {
          console.log('[AdSense] Ad slot already has ads (likely auto-initialized) for slot:', slot)
          hasPushedRef.current = true
          return true
        }
        
        // Always log other errors to help debug
        console.warn('[AdSense] Failed to push ad:', error, { slot })
        return false
      }
    }

    // Check if script is already loaded
    if (typeof window !== 'undefined') {
      // Check if the script element exists and if it loaded successfully
      const scriptElement = document.querySelector('script[src*="adsbygoogle.js"]') as HTMLScriptElement
      
      // Check if script loaded successfully (not blocked)
      // Note: readyState is a runtime property that exists in browsers but not in TypeScript DOM types
      const scriptReadyState = scriptElement && 'readyState' in scriptElement 
        ? (scriptElement as any).readyState 
        : null
      const scriptLoaded = scriptElement && (
        window.adsbygoogle !== undefined || 
        scriptReadyState === 'complete' || 
        scriptReadyState === 'loaded'
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

  // Check if ad has been filled after a delay
  useEffect(() => {
    if (!isClient || !adsEnabled) {
      // If ads are disabled, don't show placeholder
      setShowPlaceholder(false)
      return
    }

    // Always show placeholder initially when ads are enabled
    setShowPlaceholder(true)
    console.log('[AdSense] Placeholder initialized for slot:', slot, { showPlaceholder: true })

    const checkAdStatus = () => {
      const adElement = document.querySelector(`ins[data-ad-slot="${slot}"]`) as HTMLElement
      if (adElement) {
        const status = adElement.getAttribute('data-adsbygoogle-status')
        const innerHTML = adElement.innerHTML || ''
        const hasIframe = innerHTML.includes('<iframe')
        const hasAdContent = innerHTML.length > 100 // AdSense ads typically have substantial content
        
        console.log('[AdSense] Checking placeholder status for slot:', slot, {
          status,
          hasIframe,
          hasAdContent,
          innerHTMLLength: innerHTML.length,
          shouldShowPlaceholder: !(status === 'done' && hasIframe && hasAdContent),
          currentShowPlaceholder: showPlaceholder,
        })
        
        // Only hide placeholder if ad is definitely filled (status done AND has iframe AND has content)
        if (status === 'done' && hasIframe && hasAdContent) {
          console.log('[AdSense] Hiding placeholder - ad is filled for slot:', slot)
          setShowPlaceholder(false)
        } else {
          // Keep showing placeholder if ad isn't filled yet
          console.log('[AdSense] Keeping placeholder visible - ad not filled yet for slot:', slot)
          setShowPlaceholder(true)
        }
      } else {
        // Element not found yet, keep showing placeholder
        console.log('[AdSense] Ad element not found, keeping placeholder visible for slot:', slot)
        setShowPlaceholder(true)
      }
    }

    // Check immediately and after delays
    checkAdStatus()
    const timer1 = setTimeout(checkAdStatus, 1000)
    const timer2 = setTimeout(checkAdStatus, 3000)
    const timer3 = setTimeout(checkAdStatus, 5000)
    const timer4 = setTimeout(checkAdStatus, 10000) // Check again after 10 seconds

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(timer4)
    }
  }, [isClient, adsEnabled, slot, showPlaceholder])

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

  console.log('[AdSense] Rendering ad slot:', slot, { showPlaceholder, adsEnabled, isClient })

  return (
    <div className={`${className} relative`} style={{ minHeight: '100px', ...style }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: '100px', ...style }}
        data-ad-client="ca-pub-8685093412475036"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
        {...(id && { id })}
        suppressHydrationWarning
      />
      {/* Placeholder ad - shows when ad isn't filled yet */}
      {showPlaceholder && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded pointer-events-none z-10"
          style={{ minHeight: '100px', width: '100%', ...style }}
          data-testid={`ad-placeholder-${slot}`}
        >
          <div className="text-center text-gray-400">
            <div className="text-sm font-medium">Ad Placeholder</div>
            <div className="text-xs mt-1">Slot: {slot}</div>
          </div>
        </div>
      )}
    </div>
  )
}

