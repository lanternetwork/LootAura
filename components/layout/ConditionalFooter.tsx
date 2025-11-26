'use client'

import { usePathname } from 'next/navigation'
import { DesktopFooterAd } from '@/components/ads/AdSlots'
import { SiteFooter } from '@/components/layout/SiteFooter'

/**
 * Conditionally renders the global footer + desktop footer ad.
 *
 * We hide the footer on immersive sell flows (create/edit sale) to avoid
 * visual clutter and accidental navigation while composing a listing.
 */
export function ConditionalFooter() {
  const pathname = usePathname() || ''

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


