'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { DesktopFooterAd } from '@/components/ads/AdSlots'
import { SiteFooter } from '@/components/layout/SiteFooter'

/**
 * Conditionally renders the global footer + desktop footer ad.
 *
 * We hide the footer on immersive sell flows (create/edit sale) to avoid
 * visual clutter and accidental navigation while composing a listing.
 * 
 * We also hide the footer entirely when running in native WebView mode
 * (nativeFooter=1 query param or ReactNativeWebView bridge detection) to eliminate
 * stacked bottom space and prevent obstruction of the native footer overlay.
 * 
 * Uses client-side mount detection to avoid hydration mismatch: renders footer
 * normally on first render (matching SSR), then removes it immediately after mount
 * if native WebView is detected.
 */
export function ConditionalFooter() {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const isNativeFooter = searchParams.get('nativeFooter') === '1'
  
  // Client-side mount detection to avoid hydration mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Client-only, authoritative native check (only after mount)
  // window.ReactNativeWebView is the authoritative signal for native WebView context
  const isNative = mounted && (
    typeof window !== 'undefined' && 
    (!!(window as any).ReactNativeWebView || (window as any).__LOOTAURA_IN_APP === true)
  )

  // Hide footer globally when in native WebView mode (authoritative)
  // This eliminates the footer's layout contribution (278px) and prevents stacking with native footer
  // Only apply native removal after mount to avoid hydration mismatch
  if (mounted && (isNativeFooter || isNative)) {
    return null
  }

  // Hide footer on immersive sell flows (create/edit sale)
  const isSellNew = pathname === '/sell/new'
  const isSellEdit = /^\/sell\/[^/]+\/edit$/.test(pathname)
  if (isSellNew || isSellEdit) {
    return null
  }

  return (
    <>
      <DesktopFooterAd />
      <SiteFooter />
    </>
  )
}


