'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'
import SalePlaceholder from '@/components/placeholders/SalePlaceholder'
import AddressLink from '@/components/common/AddressLink'

interface MobilePinCalloutProps {
  sale: Sale | null
  pinLat: number | null
  pinLng: number | null
  mapRef: React.RefObject<any>
  onDismiss: () => void
  viewport?: { center: { lat: number; lng: number }; zoom: number } | null
}

/**
 * Pin-originated callout that appears above a selected pin on mobile.
 * The callout card has a tail/pointer that connects to the pin.
 */
export default function MobilePinCallout({ 
  sale, 
  pinLat, 
  pinLng, 
  mapRef, 
  onDismiss, 
  viewport 
}: MobilePinCalloutProps) {
  const router = useRouter()
  const calloutRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number } | null>(null)

  // Update callout position when map moves or pin coordinates change
  useEffect(() => {
    if (!sale || pinLat === null || pinLng === null || !mapRef.current) return

    const updatePosition = () => {
      const map = mapRef.current?.getMap?.()
      if (!map) return

      try {
        // Project lat/lng to screen coordinates (relative to map container)
        const point = map.project([pinLng, pinLat])
        if (point) {
          // Position is relative to map container (which is the parent)
          setPosition({ 
            x: point.x, 
            y: point.y 
          })
        }
      } catch (error) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[PIN_CALLOUT] Error projecting coordinates:', error)
        }
      }
    }

    // Initial position
    const timeoutId = setTimeout(updatePosition, 100)

    // Update on map move/zoom
    const map = mapRef.current?.getMap?.()
    if (map) {
      map.on('move', updatePosition)
      map.on('zoom', updatePosition)
      map.on('moveend', updatePosition)

      return () => {
        clearTimeout(timeoutId)
        map.off('move', updatePosition)
        map.off('zoom', updatePosition)
        map.off('moveend', updatePosition)
      }
    }

    return () => clearTimeout(timeoutId)
  }, [sale, pinLat, pinLng, mapRef])

  // Get container dimensions for bounds checking
  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return

    const updateDimensions = () => {
      const container = map.getContainer()
      if (container) {
        setContainerDimensions({
          width: container.offsetWidth,
          height: container.offsetHeight
        })
      }
    }

    updateDimensions()
    const mapInstance = map
    mapInstance.on('resize', updateDimensions)

    return () => {
      mapInstance.off('resize', updateDimensions)
    }
  }, [mapRef])

  if (!sale || !position) return null

  const cover = getSaleCoverUrl(sale)
  
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

  // Calculate callout position (above the pin)
  const CALLOUT_WIDTH = 240 // Approximate width in pixels
  const CALLOUT_HEIGHT = 120 // Approximate height in pixels
  const PIN_OFFSET = 24 // Distance from pin to callout
  const TAIL_HEIGHT = 8 // Height of the tail/pointer

  // Position callout above the pin, centered horizontally
  const left = position.x - CALLOUT_WIDTH / 2
  const top = position.y - CALLOUT_HEIGHT - PIN_OFFSET - TAIL_HEIGHT

  // Ensure callout stays within container bounds
  const containerWidth = containerDimensions?.width || (typeof window !== 'undefined' ? window.innerWidth : 0)
  const containerHeight = containerDimensions?.height || (typeof window !== 'undefined' ? window.innerHeight : 0)
  const safeLeft = Math.max(8, Math.min(left, containerWidth - CALLOUT_WIDTH - 8))
  const safeTop = Math.max(8, Math.min(top, containerHeight - CALLOUT_HEIGHT - 8))

  // Calculate tail position relative to callout
  const tailX = position.x - safeLeft

  return (
    <div
      ref={calloutRef}
      className="absolute z-50 pointer-events-auto"
      style={{
        left: `${safeLeft}px`,
        top: `${safeTop}px`,
        width: `${CALLOUT_WIDTH}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Callout card */}
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Tail/pointer pointing to pin */}
        <div
          className="absolute bottom-0 left-0 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white"
          style={{
            left: `${Math.max(8, Math.min(tailX, CALLOUT_WIDTH - 8))}px`,
            bottom: `-${TAIL_HEIGHT}px`,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
          }}
        />

        {/* Card content */}
        <div className="flex gap-3 p-3">
          {/* Thumbnail */}
          <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
            {cover ? (
              <Image
                src={cover.url}
                alt={cover.alt}
                fill
                sizes="64px"
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
                <h3 className="text-sm font-semibold line-clamp-1 mb-1">
                  {sale.title || `Sale ${sale.id}`}
                </h3>
              </div>
              {/* Close button */}
              <button
                onClick={onDismiss}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 min-w-[28px] min-h-[28px] flex items-center justify-center"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {sale.address && (
              <p className="text-xs text-gray-600 line-clamp-1 mb-1">
                <AddressLink
                  lat={pinLat}
                  lng={pinLng}
                  address={sale.address}
                  city={sale.city}
                  state={sale.state}
                  zipCode={sale.zip_code}
                />
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
              className="mt-1 bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium px-3 py-1.5 rounded-lg transition-colors text-xs w-full"
            >
              View Sale
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
