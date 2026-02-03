'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { isAdsenseRoute } from '@/lib/adsense'
import { isNativeApp } from '@/lib/runtime/isNativeApp'

interface AdsenseGuardProps {
  children: ReactNode
  /**
   * If provided, must be true for ad to render (e.g., sale loaded, list has items)
   * Parent component should pass this based on content state
   */
  hasContent?: boolean
  /**
   * Explicitly allow/disallow rendering (overrides route check)
   * Useful for cases where route is allowed but content state determines visibility
   */
  enabled?: boolean
}

/**
 * AdsenseGuard - Wrapper component that ensures ads only render on allowed routes
 * 
 * This component enforces Google AdSense policy compliance by:
 * 1. Checking if ads are enabled via NEXT_PUBLIC_ENABLE_ADSENSE
 * 2. Verifying the current route is allowed via isAdsenseRoute()
 * 3. Optionally requiring content validation via hasContent prop
 * 
 * Usage:
 * ```tsx
 * <AdsenseGuard hasContent={!!sale}>
 *   <SaleDetailBannerAd />
 * </AdsenseGuard>
 * ```
 */
export function AdsenseGuard({ 
  children, 
  hasContent = true,
  enabled = true 
}: AdsenseGuardProps) {
  const pathname = usePathname()

  // Check if ads are enabled
  const adsEnabled = typeof window !== 'undefined' && 
    (process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || 
     process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1')

  if (!adsEnabled) {
    return null
  }

  // Never show ads in Expo WebView (use centralized runtime detection)
  if (isNativeApp()) {
    return null
  }

  // Never show ads on mobile breakpoints (< 768px)
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
    return null
  }

  // If explicitly disabled, don't render
  if (!enabled) {
    return null
  }

  // Check if route is allowed
  if (!isAdsenseRoute(pathname)) {
    return null
  }

  // If content is required but not provided, don't render
  if (hasContent === false) {
    return null
  }

  return <>{children}</>
}

