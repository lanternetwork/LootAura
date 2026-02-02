'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { DesktopFooterAd } from '@/components/ads/AdSlots'
import { SiteFooter } from '@/components/layout/SiteFooter'

/**
 * Conditionally renders the global footer + desktop footer ad.
 *
 * We hide the footer on immersive sell flows (create/edit sale) to avoid
 * visual clutter and accidental navigation while composing a listing.
 * 
 * Also hide when nativeFooter=1 (native app with native footer overlay).
 */
export function ConditionalFooter() {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const isNativeFooter = searchParams.get('nativeFooter') === '1'

  const isSellNew = pathname === '/sell/new'
  const isSellEdit = /^\/sell\/[^/]+\/edit$/.test(pathname)

  if (isSellNew || isSellEdit || isNativeFooter) {
    return null
  }

  return (
    <>
      <DesktopFooterAd />
      <SiteFooter />
    </>
  )
}


