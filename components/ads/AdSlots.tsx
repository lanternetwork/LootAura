'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import AdSenseSlot from './AdSenseSlot'

/**
 * Sale Detail Banner Ad
 * Displays on sale detail page, below Shopping Tips card
 * Mobile + Desktop
 */
export function SaleDetailBannerAd() {
  return (
    <div className="mt-6 mb-2">
      <AdSenseSlot
        slot="6194845043"
        format="auto"
        fullWidthResponsive={true}
        style={{ minHeight: '90px' }}
        className="w-full"
      />
    </div>
  )
}

/**
 * Mobile List Inline Ad
 * Displays inline in mobile sales list, between sale cards
 * Mobile only (hidden on desktop)
 */
export function MobileListInlineAd() {
  return (
    <div className="block md:hidden my-3">
      <AdSenseSlot
        slot="2129152111"
        format="auto"
        fullWidthResponsive={true}
        style={{ minHeight: '100px' }}
        className="w-full"
      />
    </div>
  )
}

/**
 * List Inline Ad
 * Displays inline in sales list, between sale cards
 * Visible on all screen sizes (mobile + desktop)
 */
export function ListInlineAd() {
  return (
    <div 
      className="my-3 w-full" 
      style={{ 
        width: '100%', 
        minWidth: '200px',
        maxWidth: '100%',
        display: 'block' // Ensure it's not hidden
      }}
    >
      <AdSenseSlot
        slot="2129152111"
        format="auto"
        fullWidthResponsive={true}
        style={{ minHeight: '100px', width: '100%', display: 'block' }}
        className="w-full"
      />
    </div>
  )
}

/**
 * Desktop Footer Ad
 * Displays in footer on desktop screens
 * Desktop only (hidden on mobile/tablet)
 */
export function DesktopFooterAd() {
  const [adsEnabled, setAdsEnabled] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Check environment variable on client side
    const enabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'
    setAdsEnabled(enabled)
    
    // Check if we're in preview/staging (not production)
    const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
    const isProduction = hostname === 'lootaura.com' || hostname === 'www.lootaura.com'
    setIsPreview(!isProduction)
  }, [])

  // Disable footer ad on /sales page (using inline ads in sales list instead)
  if (pathname === '/sales') {
    return null
  }

  // In preview, always show placeholder for design purposes
  // In production, only show if ads are enabled
  if (!adsEnabled && !isPreview) {
    return null
  }

  return (
    <div className="hidden lg:block w-full bg-white border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6">
        <AdSenseSlot
          slot="2367280679"
          format="auto"
          fullWidthResponsive={true}
          style={{ minHeight: '120px' }}
          className="w-full"
        />
      </div>
    </div>
  )
}

