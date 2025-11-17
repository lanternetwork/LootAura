'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'

interface MobileSaleCalloutProps {
  sale: Sale | null
  onDismiss: () => void
  viewport?: { center: { lat: number; lng: number }; zoom: number } | null
}

/**
 * Small callout card that appears at the bottom of the map when a sale pin is selected on mobile.
 * This replaces the large bottom tray for a more minimal, map-focused experience.
 */
export default function MobileSaleCallout({ sale, onDismiss, viewport }: MobileSaleCalloutProps) {
  const router = useRouter()
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null)
  const [swipeDeltaY, setSwipeDeltaY] = useState(0)

  if (!sale) return null

  const cover = getSaleCoverUrl(sale)
  
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
  
  // Build detail page URL with viewport params to restore view on back
  const detailUrl = viewport 
    ? `/sales/${sale.id}?lat=${viewport.center.lat}&lng=${viewport.center.lng}&zoom=${viewport.zoom}`
    : `/sales/${sale.id}`

  const handleViewSale = () => {
    router.push(detailUrl)
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

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 px-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      onClick={(e) => {
        // Allow clicks on the card itself to work, but clicking outside dismisses
        if (e.target === e.currentTarget) {
          onDismiss()
        }
      }}
    >
      <div 
        className="bg-white rounded-t-2xl shadow-lg border-t border-gray-200 max-w-full mx-auto mb-4 will-change-transform transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: swipeDeltaY > 0 ? `translateY(${swipeDeltaY}px)` : 'translateY(0)',
        }}
      >
        {/* Swipe indicator / Drag handle */}
        <div 
          className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-label="Swipe down to dismiss"
        >
          <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Card content */}
        <div className="flex gap-3 p-4">
          {/* Thumbnail */}
          <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
            {cover ? (
              <Image
                src={cover.url}
                alt={cover.alt}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <SalePlaceholder className="w-full h-full opacity-60" />
              </div>
            )}
          </div>

          {/* Sale info */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold line-clamp-1 mb-1">
                  {sale.title || `Sale ${sale.id}`}
                </h3>
              </div>
              {/* Close button */}
              <button
                onClick={onDismiss}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {sale.address && (
              <p className="text-xs text-gray-600 line-clamp-1 mb-1">
                {sale.address}
                {sale.city && sale.state && `, ${sale.city}, ${sale.state}`}
              </p>
            )}
            {sale.date_start && (
              <p className="text-xs text-gray-500 mb-2">
                {formatDate(sale.date_start, sale.time_start)}
              </p>
            )}
            
            {/* Action button */}
            <button
              onClick={handleViewSale}
              className="mt-2 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium px-4 py-2 rounded-lg transition-colors text-sm w-full"
            >
              View Sale
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

