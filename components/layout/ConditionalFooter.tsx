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
 */
export function ConditionalFooter() {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const isNativeFooter = searchParams.get('nativeFooter') === '1'
  
  // Use centralized runtime detection (no timing hacks needed)
  const hideForNativeApp = isNativeApp()

  const isSellNew = pathname === '/sell/new'
  const isSellEdit = /^\/sell\/[^/]+\/edit$/.test(pathname)

  if (isSellNew || isSellEdit || isNativeFooter || hideForNativeApp) {
    return null
  }

  return (
    <>
      <DesktopFooterAd />
      <SiteFooter />
    </>
  )
}


