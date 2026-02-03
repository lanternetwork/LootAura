'use client'

import { useState, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { DesktopFooterAd } from '@/components/ads/AdSlots'
import { SiteFooter } from '@/components/layout/SiteFooter'

/**
 * Conditionally renders the global footer + desktop footer ad.
 *
 * We hide the footer on immersive sell flows (create/edit sale) to avoid
 * visual clutter and accidental navigation while composing a listing.
 * 
 * Also hide when nativeFooter=1 (native app with native footer overlay) or
 * when running inside Expo WebView (detected via window.ReactNativeWebView).
 */
export function ConditionalFooter() {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const isNativeFooter = searchParams.get('nativeFooter') === '1'
  
  // Check if running inside Expo WebView (client-side only)
  // Use useState + useEffect to ensure check happens after mount when window.ReactNativeWebView is available
  const [isInWebView, setIsInWebView] = useState(() => {
    // Initial check during render (for immediate hiding if available)
    if (typeof window === 'undefined') return false
    return typeof (window as any).ReactNativeWebView !== 'undefined' && 
           (window as any).ReactNativeWebView !== null
  })
  
  useEffect(() => {
    // Double-check after mount to catch cases where ReactNativeWebView loads asynchronously
    if (typeof window !== 'undefined') {
      const checkWebView = () => {
        const inWebView = typeof (window as any).ReactNativeWebView !== 'undefined' && 
                         (window as any).ReactNativeWebView !== null
        if (inWebView !== isInWebView) {
          setIsInWebView(inWebView)
        }
      }
      checkWebView()
      // Also check after a short delay in case ReactNativeWebView loads asynchronously
      const timeout = setTimeout(checkWebView, 100)
      return () => clearTimeout(timeout)
    }
  }, [isInWebView])

  const isSellNew = pathname === '/sell/new'
  const isSellEdit = /^\/sell\/[^/]+\/edit$/.test(pathname)

  if (isSellNew || isSellEdit || isNativeFooter || isInWebView) {
    return null
  }

  return (
    <>
      <DesktopFooterAd />
      <SiteFooter />
    </>
  )
}


