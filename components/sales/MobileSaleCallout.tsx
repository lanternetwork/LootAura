'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
import AddressLink from '@/components/common/AddressLink'
import { buildDesktopGoogleMapsUrl, buildIosNavUrl, buildAndroidNavUrl } from '@/lib/location/mapsLinks'
import { trackAnalyticsEvent } from '@/lib/analytics-client'

interface MobileSaleCalloutProps {
  sale: Sale | null
  onDismiss: () => void
  viewport?: { center: { lat: number; lng: number }; zoom: number } | null
  pinPosition?: { x: number; y: number } | null
}

/**
 * Small callout card that appears at the bottom of the map when a sale pin is selected on mobile.
 * This replaces the large bottom tray for a more minimal, map-focused experience.
 * 
 * Features:
 * - Compact design with image, title, address, and action button
 * - Swipe-to-dismiss gesture support
 * - Positioned relative to pin location when available
 */
type Platform = 'ios' | 'android' | 'desktop'

/**
 * Detect platform from user agent
 * SSR-safe - returns 'desktop' during SSR, detects on client
 */
function detectPlatform(): Platform {
  if (typeof window === 'undefined') {
    return 'desktop'
  }

  const userAgent = navigator.userAgent || ''

  // Check for iPhone or iPod (exclude iPad - treat as desktop)
  if (/iPhone|iPod/.test(userAgent)) {
    return 'ios'
  }

  // Check for Android mobile devices (must have both Android and Mobile)
  if (/Android/.test(userAgent) && /Mobile/.test(userAgent)) {
    return 'android'
  }

  // Default to desktop
  return 'desktop'
}

export default function MobileSaleCallout({ sale, onDismiss, viewport, pinPosition }: MobileSaleCalloutProps) {
  const router = useRouter()
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null)
  const [swipeDeltaY, setSwipeDeltaY] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const [platform, setPlatform] = useState<Platform>('desktop')
  const [isClient, setIsClient] = useState(false)
  
  // Swipe-to-dismiss gesture handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setSwipeStartY(e.touches[0].clientY)
    setSwipeDeltaY(0)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeStartY === null) return
    const currentY = e.touches[0].clientY
    const delta = currentY - swipeStartY
    // Only allow downward swipes (positive delta)
    if (delta > 0) {
      setSwipeDeltaY(delta)
    }
  }, [swipeStartY])

  const handleTouchEnd = useCallback(() => {
    // If swiped down more than 100px, dismiss the callout
    if (swipeDeltaY > 100) {
      onDismiss()
    }
    setSwipeStartY(null)
    setSwipeDeltaY(0)
  }, [swipeDeltaY, onDismiss])

  // Detect platform on client side only
  useEffect(() => {
    setIsClient(true)
    setPlatform(detectPlatform())
  }, [])

  // Calculate card offset to position pointer at pin
  // Hooks must be called before any early returns
  const [cardOffset, setCardOffset] = useState(140)
  
  useEffect(() => {
    if (pinPosition && cardRef.current) {
      const cardHeight = cardRef.current.offsetHeight
      // Pointer is 8px tall, position card so pointer tip aligns with pin
      // Card bottom should be at pin.y - 8px, so offset = cardHeight + 8px
      setCardOffset(cardHeight + 8)
    }
  }, [pinPosition, sale])

  // Build navigation URL based on platform
  const getNavigationUrl = useCallback(() => {
    if (!sale) return ''
    
    const address = sale.address && sale.city && sale.state 
      ? `${sale.address}, ${sale.city}, ${sale.state}` 
      : sale.address ?? undefined

    if (!isClient || platform === 'desktop') {
      return buildDesktopGoogleMapsUrl({ lat: sale.lat ?? undefined, lng: sale.lng ?? undefined, address })
    } else if (platform === 'ios') {
      return buildIosNavUrl({ lat: sale.lat ?? undefined, lng: sale.lng ?? undefined, address })
    } else if (platform === 'android') {
      return buildAndroidNavUrl({ lat: sale.lat ?? undefined, lng: sale.lng ?? undefined, address })
    }
    return buildDesktopGoogleMapsUrl({ lat: sale.lat ?? undefined, lng: sale.lng ?? undefined, address })
  }, [sale, platform, isClient])

  if (!sale) return null

  const cover = getSaleCoverUrl(sale)
  
  // Build detail page URL with viewport params to restore view on back
  const detailUrl = viewport 
    ? `/sales/${sale.id}?lat=${viewport.center.lat}&lng=${viewport.center.lng}&zoom=${viewport.zoom}`
    : `/sales/${sale.id}`

  const handleViewSale = () => {
    // Track click event
    trackAnalyticsEvent({
      sale_id: sale.id,
      event_type: 'click',
    })
    
    // If in React Native WebView, send message to native app
    if (typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
      console.log('[WEB] Sending OPEN_SALE message for sale:', sale.id);
      (window as any).ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'OPEN_SALE', saleId: sale.id })
      );
    } else {
      // Fallback to normal Next.js navigation when not in WebView
      router.push(detailUrl);
    }
  }

  const formatDate = (dateStr: string, timeStr?: string) => {
    if (!dateStr) return ''
    try {
      const date = timeStr ? new Date(`${dateStr}T${timeStr}`) : new Date(dateStr)
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        ...(timeStr ? { hour: 'numeric', minute: '2-digit' } : {})
      })
    } catch {
      return dateStr
    }
  }

  // Calculate position relative to pin
  // When pinPosition is set, position card directly without full-screen overlay to avoid blocking map
  const cardStyle = pinPosition
    ? {
        position: 'absolute' as const,
        left: `${pinPosition.x}px`,
        top: `${pinPosition.y}px`,
        // Position card so pointer tip (8px below card bottom) points to pin
        transform: `translate(-50%, ${swipeDeltaY > 0 ? swipeDeltaY - cardOffset : -cardOffset}px)`,
        maxWidth: 'calc(100vw - 2rem)',
        width: '220px',
        zIndex: 50
      }
    : {
        transform: swipeDeltaY > 0 ? `translateY(${swipeDeltaY}px)` : 'translateY(0)',
      }

  // When positioned relative to pin, render card directly without overlay container
  // This prevents the overlay from blocking map interactions
  if (pinPosition) {
    return (
      <div 
        ref={cardRef}
        className={`bg-white rounded-2xl shadow-lg border border-gray-200 will-change-transform transition-transform duration-200 relative pointer-events-none`}
        style={cardStyle}
      >
        {/* Callout pointer/arrow pointing to pin */}
        <div 
          className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full w-0 h-0"
          style={{
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '8px solid white',
            filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
          }}
        />
        
        {/* Card content - disable all pointer events to allow map dragging */}
        <div className="flex flex-col p-0 overflow-hidden rounded-2xl pointer-events-none">
          {/* Image at top - full width, half size */}
          <div className="relative w-full h-16 bg-gray-100 rounded-t-2xl overflow-hidden pointer-events-none">
            {cover ? (
              <Image
                src={cover.url}
                alt={cover.alt}
                fill
                sizes="(max-width: 400px) 100vw, 400px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <SalePlaceholder className="w-full h-full opacity-60" />
              </div>
            )}
            {/* Close button overlay on image */}
            <button
              onClick={onDismiss}
              className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white text-gray-600 rounded-full min-w-[28px] min-h-[28px] flex items-center justify-center shadow-sm transition-colors pointer-events-auto"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content section - only buttons/links should capture events */}
          <div className="flex flex-col p-2 pointer-events-none">
            {/* Title */}
            <h3 className="text-base font-semibold line-clamp-2 mb-1">
              {sale.title || `Sale ${sale.id}`}
            </h3>

            {/* Address and date */}
            <div className="space-y-0.5 mb-2">
              {sale.address && (
                <p className="text-xs text-gray-600 line-clamp-1">
                  <AddressLink
                    lat={sale.lat ?? undefined}
                    lng={sale.lng ?? undefined}
                    address={sale.address && sale.city && sale.state ? `${sale.address}, ${sale.city}, ${sale.state}` : sale.address}
                  >
                    {sale.address}
                    {sale.city && sale.state && `, ${sale.city}, ${sale.state}`}
                  </AddressLink>
                </p>
              )}
              {sale.date_start && (
                <p className="text-xs text-gray-500">
                  {formatDate(sale.date_start, sale.time_start)}
                </p>
              )}
            </div>

            {/* Action buttons - side by side */}
            <div className="flex gap-2 pointer-events-auto">
              {/* Navigation button */}
              <a
                href={getNavigationUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-2.5 rounded-lg transition-colors flex items-center justify-center min-w-[48px]"
                aria-label="Start navigation"
                onClick={() => {
                  trackAnalyticsEvent({
                    sale_id: sale.id,
                    event_type: 'click',
                  })
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </a>
              
              {/* View Sale button - reduced width */}
              <button
                onClick={handleViewSale}
                className="flex-1 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium px-4 py-2.5 rounded-lg transition-colors text-sm"
              >
                View Sale
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // When at bottom (no pinPosition), use the original overlay approach
  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 px-4"
      style={{
        position: 'fixed' as const,
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        zIndex: 50
      }}
      onClick={(e) => {
        // Allow clicks on the card itself to work, but clicking outside dismisses
        if (e.target === e.currentTarget) {
          onDismiss()
        }
      }}
    >
      <div 
        ref={cardRef}
        className={`bg-white ${pinPosition ? 'rounded-2xl' : 'rounded-t-2xl'} shadow-lg ${pinPosition ? 'border' : 'border-t'} border-gray-200 ${pinPosition ? '' : 'max-w-full mx-auto mb-4'} will-change-transform transition-transform duration-200 relative`}
        onClick={(e) => e.stopPropagation()}
        style={cardStyle}
      >
        {/* Callout pointer/arrow pointing to pin */}
        {pinPosition && (
          <div 
            className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full w-0 h-0"
            style={{
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '8px solid white',
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
            }}
          />
        )}
        
        {/* Swipe indicator / Drag handle - only show when at bottom */}
        {!pinPosition && (
          <div 
            className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            aria-label="Swipe down to dismiss"
          >
            <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
          </div>
        )}

        {/* Card content */}
        <div className={`flex flex-col ${pinPosition ? 'p-0' : 'p-0'} overflow-hidden ${pinPosition ? 'rounded-2xl' : 'rounded-t-2xl'}`}>
          {/* Image at top - full width, half size */}
          <div className={`relative w-full h-16 bg-gray-100 ${pinPosition ? 'rounded-t-2xl' : 'rounded-t-2xl'} overflow-hidden`}>
            {cover ? (
              <Image
                src={cover.url}
                alt={cover.alt}
                fill
                sizes="(max-width: 400px) 100vw, 400px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <SalePlaceholder className="w-full h-full opacity-60" />
              </div>
            )}
            {/* Close button overlay on image */}
            <button
              onClick={onDismiss}
              className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white text-gray-600 rounded-full min-w-[28px] min-h-[28px] flex items-center justify-center shadow-sm transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content section */}
          <div className={`flex flex-col ${pinPosition ? 'p-2' : 'p-3'}`}>
            {/* Title */}
            <h3 className="text-base font-semibold line-clamp-2 mb-1">
              {sale.title || `Sale ${sale.id}`}
            </h3>

            {/* Address and date */}
            <div className="space-y-0.5 mb-2">
              {sale.address && (
                <p className="text-xs text-gray-600 line-clamp-1">
                  <AddressLink
                    lat={sale.lat ?? undefined}
                    lng={sale.lng ?? undefined}
                    address={sale.address && sale.city && sale.state ? `${sale.address}, ${sale.city}, ${sale.state}` : sale.address}
                  >
                    {sale.address}
                    {sale.city && sale.state && `, ${sale.city}, ${sale.state}`}
                  </AddressLink>
                </p>
              )}
              {sale.date_start && (
                <p className="text-xs text-gray-500">
                  {formatDate(sale.date_start, sale.time_start)}
                </p>
              )}
            </div>

            {/* Action buttons - side by side */}
            <div className="flex gap-2">
              {/* Navigation button */}
              <a
                href={getNavigationUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-2.5 rounded-lg transition-colors flex items-center justify-center min-w-[48px]"
                aria-label="Start navigation"
                onClick={() => {
                  trackAnalyticsEvent({
                    sale_id: sale.id,
                    event_type: 'click',
                  })
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </a>
              
              {/* View Sale button - reduced width */}
              <button
                onClick={handleViewSale}
                className="flex-1 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium px-4 py-2.5 rounded-lg transition-colors text-sm"
              >
                View Sale
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

