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
  const [isPreview, setIsPreview] = useState(false)
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const hasPushedRef = useRef(false) // Track if we've already pushed this ad
  const resizeObserverRef = useRef<ResizeObserver | null>(null) // Track ResizeObserver for cleanup
  const timeoutRefsRef = useRef<NodeJS.Timeout[]>([]) // Track timeouts for cleanup

  useEffect(() => {
    setIsClient(true)
    // Check environment variable on client side
    const enabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'
    setAdsEnabled(enabled)
    
    // Check if we're in preview/staging (not production)
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      const isProduction = hostname === 'lootaura.com' || hostname === 'www.lootaura.com'
      setIsPreview(!isProduction)
    }
    
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
          const adElement = document.querySelector(`ins[data-ad-slot="${slot}"]`) as HTMLElement
          if (!adElement) {
            console.warn('[AdSense] Ad slot element not found in DOM for slot:', slot)
            return false
          }
          
          // Check if this element already has an ad (AdSense may have auto-initialized it)
          if (adElement.hasAttribute('data-adsbygoogle-status')) {
            console.log('[AdSense] Ad slot already initialized by AdSense for slot:', slot)
            hasPushedRef.current = true
            return true
          }
          
          // CRITICAL: Ensure container has dimensions before pushing
          // AdSense requires the container to have a width > 0
          const rect = adElement.getBoundingClientRect()
          const computedStyle = window.getComputedStyle(adElement)
          const parentElement = adElement.parentElement
          const parentRect = parentElement?.getBoundingClientRect()
          const parentWidth = parentRect?.width || 0
          
          // Check if element or its parent has width
          const hasWidth = rect.width > 0 || parseInt(computedStyle.width) > 0 || parentWidth > 0
          const isVisible = adElement.offsetParent !== null && computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden'
          
          if (!hasWidth || !isVisible) {
            // Container doesn't have dimensions yet, wait and retry using ResizeObserver
            console.log('[AdSense] Container has no width or is hidden, waiting for dimensions for slot:', slot, {
              width: rect.width,
              height: rect.height,
              computedWidth: computedStyle.width,
              parentWidth: parentWidth,
              isVisible,
              display: computedStyle.display,
              visibility: computedStyle.visibility,
              offsetParent: adElement.offsetParent !== null,
            })
            
            // Use ResizeObserver to wait for container to have dimensions
            const tryPush = () => {
              if (hasPushedRef.current || !window.adsbygoogle) return
              
              const checkRect = adElement.getBoundingClientRect()
              const checkStyle = window.getComputedStyle(adElement)
              const checkParentElement = adElement.parentElement
              const checkParentRect = checkParentElement?.getBoundingClientRect()
              const checkParentWidth = checkParentRect?.width || 0
              
              // Check if element or its parent has width
              const checkHasWidth = checkRect.width > 0 || parseInt(checkStyle.width) > 0 || checkParentWidth > 0
              const checkIsVisible = adElement.offsetParent !== null && checkStyle.display !== 'none' && checkStyle.visibility !== 'hidden'
              
              if (checkHasWidth && checkIsVisible) {
                // Clean up observer and timeouts
                if (resizeObserverRef.current) {
                  resizeObserverRef.current.disconnect()
                  resizeObserverRef.current = null
                }
                timeoutRefsRef.current.forEach(t => clearTimeout(t))
                timeoutRefsRef.current = []
                
                // Now we have dimensions, try to push
                try {
                  window.adsbygoogle.push({})
                  hasPushedRef.current = true
                  console.log('[AdSense] Pushed ad after waiting for dimensions for slot:', slot, {
                    width: checkRect.width,
                    height: checkRect.height,
                  })
                } catch (error) {
                  console.warn('[AdSense] Failed to push ad after retry:', error, { slot })
                }
              }
            }
            
            // Set up ResizeObserver to watch for size changes
            if (typeof ResizeObserver !== 'undefined') {
              // Clean up any existing observer
              if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect()
              }
              
              resizeObserverRef.current = new ResizeObserver(() => {
                tryPush()
              })
              resizeObserverRef.current.observe(adElement)
            }
            
            // Also try after multiple RAF cycles and timeouts as fallback
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                tryPush()
                
                // Additional retries with delays
                const timeout1 = setTimeout(() => {
                  tryPush()
                  const timeout2 = setTimeout(() => {
                    tryPush()
                    // Final cleanup if still no width after 2 seconds
                    if (!hasPushedRef.current) {
                      console.warn('[AdSense] Container still has no width after 2 seconds for slot:', slot, {
                        width: adElement.getBoundingClientRect().width,
                        computedWidth: window.getComputedStyle(adElement).width,
                      })
                      if (resizeObserverRef.current) {
                        resizeObserverRef.current.disconnect()
                        resizeObserverRef.current = null
                      }
                    }
                  }, 1000)
                  timeoutRefsRef.current.push(timeout2)
                }, 500)
                timeoutRefsRef.current.push(timeout1)
              })
            })
            
            return false
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
        return () => {
          clearTimeout(timer)
          // Clean up ResizeObserver and timeouts
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect()
            resizeObserverRef.current = null
          }
          timeoutRefsRef.current.forEach(t => clearTimeout(t))
          timeoutRefsRef.current = []
        }
      } else {
        // Script element doesn't exist yet, wait a bit
        const timer = setTimeout(() => {
          const script = document.querySelector('script[src*="adsbygoogle.js"]')
          if (script && window.adsbygoogle) {
            initAd()
          }
        }, 500)
        return () => {
          clearTimeout(timer)
          // Clean up ResizeObserver and timeouts
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect()
            resizeObserverRef.current = null
          }
          timeoutRefsRef.current.forEach(t => clearTimeout(t))
          timeoutRefsRef.current = []
        }
      }
    }
    
    // Cleanup function for the effect
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
      timeoutRefsRef.current.forEach(t => clearTimeout(t))
      timeoutRefsRef.current = []
    }
  }, [isClient, adsEnabled, slot])

  // Check if ad has been filled after a delay
  useEffect(() => {
    if (!isClient) {
      return
    }

    // In preview, always show placeholder for design purposes
    // In production, only show if ads are enabled
    if (!adsEnabled && !isPreview) {
      setShowPlaceholder(false)
      return
    }

    // Always show placeholder initially when ads are enabled or in preview
    setShowPlaceholder(true)
    console.log('[AdSense] Placeholder initialized for slot:', slot, { showPlaceholder: true, isPreview, adsEnabled })

    const checkAdStatus = () => {
      const adElement = document.querySelector(`ins[data-ad-slot="${slot}"]`) as HTMLElement
      if (adElement) {
        const status = adElement.getAttribute('data-adsbygoogle-status')
        const innerHTML = adElement.innerHTML || ''
        const hasIframe = innerHTML.includes('<iframe')
        const hasAdContent = innerHTML.length > 100 // AdSense ads typically have substantial content
        
        // Check if ad is actually visible (has dimensions)
        const rect = adElement.getBoundingClientRect()
        const isVisible = rect.width > 0 && rect.height > 0 && adElement.offsetParent !== null
        
        console.log('[AdSense] Checking placeholder status for slot:', slot, {
          status,
          hasIframe,
          hasAdContent,
          innerHTMLLength: innerHTML.length,
          isVisible,
          dimensions: { width: rect.width, height: rect.height },
          shouldShowPlaceholder: !(status === 'done' && hasIframe && hasAdContent && isVisible),
          currentShowPlaceholder: showPlaceholder,
        })
        
        // Only hide placeholder if ad is definitely filled AND visible AND has substantial content
        // Check hostname to detect production (lootaura.com) vs preview/staging
        const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
        const isProductionDomain = hostname === 'lootaura.com' || hostname === 'www.lootaura.com'
        
        // More strict checks: ad must have iframe, substantial content, be visible, AND have reasonable dimensions
        const hasReasonableDimensions = rect.width >= 200 && rect.height >= 50 // Minimum reasonable ad size
        const hasSubstantialContent = innerHTML.length > 500 // More substantial content check
        
        // Also check if there's actually an iframe with src (not just empty iframe tag)
        const iframeElement = adElement.querySelector('iframe')
        const hasValidIframe = iframeElement && iframeElement.src && iframeElement.src.length > 0
        
        // Check if iframe has reasonable dimensions (not collapsed)
        const iframeRect = iframeElement?.getBoundingClientRect()
        const iframeHasDimensions = iframeRect && iframeRect.width > 0 && iframeRect.height > 0
        
        // For production, require all checks including iframe dimensions
        // This prevents hiding placeholder when ad is "done" but iframe is collapsed/empty or not visible
        // In non-production (preview/staging), always show placeholder unless ad is fully loaded with dimensions
        const shouldHidePlaceholder = isProductionDomain && 
          status === 'done' && 
          hasValidIframe && 
          hasSubstantialContent && 
          isVisible && 
          hasReasonableDimensions &&
          iframeHasDimensions && // Iframe must have dimensions
          (iframeRect?.width || 0) >= 200 && // Iframe must be at least 200px wide
          (iframeRect?.height || 0) >= 50 // Iframe must be at least 50px tall
        
        if (shouldHidePlaceholder) {
          console.log('[AdSense] Hiding placeholder - ad is filled and visible for slot:', slot, {
            status,
            hasValidIframe,
            hasSubstantialContent,
            isVisible,
            hasReasonableDimensions,
            iframeHasDimensions,
            dimensions: { width: rect.width, height: rect.height },
            iframeDimensions: iframeRect ? { width: iframeRect.width, height: iframeRect.height } : null,
          })
          setShowPlaceholder(false)
        } else {
          // Keep showing placeholder if ad isn't filled yet, not visible, or in non-production
          console.log('[AdSense] Keeping placeholder visible for slot:', slot, {
            reason: !isProductionDomain ? 'non-production domain' 
              : !hasValidIframe ? 'no valid iframe' 
              : !hasSubstantialContent ? 'insufficient content' 
              : !isVisible ? 'ad not visible' 
              : !hasReasonableDimensions ? 'dimensions too small' 
              : 'ad not filled',
            status,
            hasIframe: !!iframeElement,
            iframeSrc: iframeElement?.src || 'none',
            contentLength: innerHTML.length,
            dimensions: { width: rect.width, height: rect.height },
          })
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
  }, [isClient, adsEnabled, isPreview, slot])

  // In preview, always show placeholder for design purposes
  // In production, only show if ads are enabled
  if (!adsEnabled && !isPreview) {
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
    <div 
      className={`${className} relative`} 
      style={{ 
        minHeight: '100px', 
        width: '100%',
        minWidth: '200px', // Ensure minimum width for AdSense
        ...style 
      }}
    >
      <ins
        className="adsbygoogle"
        style={{ 
          display: 'block', 
          minHeight: '100px', 
          width: '100%',
          minWidth: '200px', // Ensure minimum width for AdSense
          ...style 
        }}
        data-ad-client="ca-pub-8685093412475036"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
        {...(id && { id })}
        suppressHydrationWarning
      />
      {/* Placeholder ad - shows when ad isn't filled yet or in non-production */}
      {showPlaceholder && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded pointer-events-none"
          style={{ 
            minHeight: '100px', 
            width: '100%',
            minWidth: '200px',
            zIndex: 10, // Always on top when placeholder is shown
            ...style 
          }}
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

