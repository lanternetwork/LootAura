'use client'

import { useEffect, useState } from 'react'
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
    <div className="my-3">
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
 * Desktop Footer Ad
 * Displays in footer on desktop screens
 * Desktop only (hidden on mobile/tablet)
 */
export function DesktopFooterAd() {
  // Disabled for now - using inline ads in sales list instead
  return null

  // const [adsEnabled, setAdsEnabled] = useState(false)

  // useEffect(() => {
  //   // Check environment variable on client side
  //   const enabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'
  //   setAdsEnabled(enabled)
  // }, [])

  // // Don't render anything if ads are disabled
  // if (!adsEnabled) {
  //   return null
  // }

  // return (
  //   <div className="hidden lg:block mt-6">
  //     <AdSenseSlot
  //       slot="2367280679"
  //       format="auto"
  //       fullWidthResponsive={true}
  //       style={{ minHeight: '120px' }}
  //       className="w-full"
  //     />
  //   </div>
  // )
}

