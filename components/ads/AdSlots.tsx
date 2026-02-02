'use client'

import { usePathname } from 'next/navigation'
import AdSenseSlot from './AdSenseSlot'
import { AdsenseGuard } from './AdsenseGuard'
import { isAdsenseRoute } from '@/lib/adsense'

/**
 * Sale Detail Banner Ad
 * Displays on sale detail page, below Shopping Tips card
 * Mobile + Desktop
 * 
 * AdSense Policy Compliance: Only renders when sale data is loaded
 * (not during loading states or when sale is null/not found)
 */
export function SaleDetailBannerAd({ saleId }: { saleId?: string | null }) {
  // Only render if we have a valid sale ID (indicates sale is loaded)
  if (!saleId) {
    return null
  }

  return (
    <AdsenseGuard hasContent={!!saleId}>
      {/* Remove extra margins on mobile - parent space-y-4 handles spacing */}
      <div className="mt-0 mb-0 md:mt-6 md:mb-2">
        <AdSenseSlot
          slot="6194845043"
          format="auto"
          fullWidthResponsive={true}
          style={{ minHeight: '90px' }}
          className="w-full"
        />
      </div>
    </AdsenseGuard>
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
 * 
 * AdSense Policy Compliance: Only renders on content-rich routes
 * (not on homepage, auth pages, info pages, error pages, etc.)
 * 
 * Note: Desktop footer ad is NOT shown on /sales (inline ads used instead)
 * but is shown on /sales/[id] (sale detail pages)
 */
export function DesktopFooterAd() {
  const pathname = usePathname()

  // Desktop footer ad is NOT shown on /sales (inline ads used instead)
  // but is shown on /sales/[id] (sale detail pages)
  const isAllowedRoute = isAdsenseRoute(pathname) && pathname !== '/sales'

  return (
    <AdsenseGuard enabled={isAllowedRoute}>
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
    </AdsenseGuard>
  )
}

