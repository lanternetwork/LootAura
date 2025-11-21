'use client'

import { usePathname } from 'next/navigation'
import AdSenseSlot from './AdSenseSlot'
import { ENV_PUBLIC } from '@/lib/env'

/**
 * Sale Detail Banner Ad
 * Slot: lootaura_sale_detail_banner (6194845043)
 * Displays on sale detail page, in sidebar (desktop) or below main content (mobile)
 * Full-width block, respects mobile breakpoints
 */
export function SaleDetailBannerAd() {
  // Only render when ads are enabled
  if (typeof window === 'undefined' || !ENV_PUBLIC.NEXT_PUBLIC_ENABLE_ADSENSE) {
    return null
  }

  return (
    <div className="mt-6 mb-2 w-full">
      <AdSenseSlot
        slot="6194845043"
        format="auto"
        fullWidthResponsive={true}
        style={{ minHeight: '90px', width: '100%' }}
        className="w-full"
      />
    </div>
  )
}

/**
 * Mobile List Inline Ad
 * Slot: lootaura_mobile_list_inline (2129152111)
 * Displays inline in mobile sales list, between sale cards
 * Mobile only (hidden on desktop via parent wrapper)
 */
export function MobileListInlineAd() {
  // Only render when ads are enabled
  if (typeof window === 'undefined' || !ENV_PUBLIC.NEXT_PUBLIC_ENABLE_ADSENSE) {
    return null
  }

  return (
    <div className="my-3 w-full">
      <AdSenseSlot
        slot="2129152111"
        format="auto"
        fullWidthResponsive={true}
        style={{ minHeight: '100px', width: '100%' }}
        className="w-full"
      />
    </div>
  )
}

/**
 * List Inline Ad
 * Slot: lootaura_mobile_list_inline (2129152111) - same slot as mobile, used for desktop
 * Displays inline in sales list, between sale cards
 * Visible on all screen sizes (mobile + desktop)
 */
export function ListInlineAd() {
  // Only render when ads are enabled
  if (typeof window === 'undefined' || !ENV_PUBLIC.NEXT_PUBLIC_ENABLE_ADSENSE) {
    return null
  }

  return (
    <div 
      className="my-3 w-full" 
      style={{ 
        width: '100%', 
        minWidth: '200px',
        maxWidth: '100%',
        display: 'block'
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
 * Slot: lootaura_desktop_footer (2367280679)
 * Displays in footer on desktop screens only
 * Hidden on mobile/tablet via CSS (hidden lg:block)
 * Disabled on /sales page (using inline ads in sales list instead)
 */
export function DesktopFooterAd() {
  const pathname = usePathname()

  // Only render when ads are enabled
  if (typeof window === 'undefined' || !ENV_PUBLIC.NEXT_PUBLIC_ENABLE_ADSENSE) {
    return null
  }

  // Disable footer ad on /sales page (using inline ads in sales list instead)
  if (pathname === '/sales') {
    return null
  }

  return (
    <div className="hidden lg:block mt-6 w-full">
      <AdSenseSlot
        slot="2367280679"
        format="auto"
        fullWidthResponsive={true}
        style={{ minHeight: '120px', width: '100%' }}
        className="w-full"
      />
    </div>
  )
}
