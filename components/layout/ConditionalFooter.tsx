'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { DesktopFooterAd } from '@/components/ads/AdSlots'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { isNativeApp } from '@/lib/runtime/isNativeApp'

/**
 * Conditionally renders the global footer + desktop footer ad.
 *
 * We hide the footer on immersive sell flows (create/edit sale) to avoid
 * visual clutter and accidental navigation while composing a listing.
 * 
 * We also hide the footer entirely when running in native WebView mode
 * (nativeFooter=1 query param or isNativeApp() detection) to eliminate
 * stacked bottom space and prevent obstruction of the native footer overlay.
 */
export function ConditionalFooter() {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const isNativeFooter = searchParams.get('nativeFooter') === '1'
  
  // Use centralized runtime detection (no timing hacks needed)
  const hideForNativeApp = isNativeApp()

  // Hide footer globally when in native WebView mode (authoritative)
  // This eliminates the footer's layout contribution (278px) and prevents stacking with native footer
  if (isNativeFooter || hideForNativeApp) {
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


