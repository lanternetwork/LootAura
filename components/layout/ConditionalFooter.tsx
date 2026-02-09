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
 * Also hide when nativeFooter=1 (native app with native footer overlay) or
 * when running inside Expo WebView (detected via centralized runtime detection).
 * 
 * Specifically hide on Sale Detail pages (/sales/[id]) when in native mode
 * to prevent footer from obstructing native footer overlay.
 */
export function ConditionalFooter() {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const isNativeFooter = searchParams.get('nativeFooter') === '1'
  
  // Use centralized runtime detection (no timing hacks needed)
  const hideForNativeApp = isNativeApp()

  const isSellNew = pathname === '/sell/new'
  const isSellEdit = /^\/sell\/[^/]+\/edit$/.test(pathname)
  
  // Check if we're on a Sale Detail page
  const isSaleDetail = /^\/sales\/[^/]+$/.test(pathname)

  // Hide footer if:
  // 1. On sell flows (new/edit)
  // 2. Native footer param is present
  // 3. Running in native app (any page) - this already covers Sale Detail, but we make it explicit below
  // 4. On Sale Detail page when in native mode (explicit check for clarity and defensive measure)
  if (isSellNew || isSellEdit || isNativeFooter || hideForNativeApp || (isSaleDetail && (isNativeFooter || hideForNativeApp))) {
    return null
  }

  return (
    <>
      <DesktopFooterAd />
      <SiteFooter />
    </>
  )
}


