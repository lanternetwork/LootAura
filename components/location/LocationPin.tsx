'use client'

import { useCallback, useState, useEffect } from 'react'
import { Marker } from 'react-map-gl'
import { LocationGroup } from '@/lib/pins/types'

interface LocationPinProps {
  location: LocationGroup
  isSelected?: boolean
  onClick?: (locationId: string) => void
}

export default function LocationPin({ 
  location, 
  isSelected = false,
  onClick 
}: LocationPinProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.(location.id)
  }, [location.id, onClick])

  const handleMouseEnter = useCallback(() => {
    if (!isMobile) {
      setShowTooltip(true)
    }
  }, [isMobile])

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false)
  }, [])

  // Get tooltip content - show first sale title or count
  const tooltipContent = location.totalSales === 1 && location.sales?.[0]
    ? location.sales[0].title || 'Yard sale'
    : `${location.totalSales} sales`

  return (
    <Marker
      longitude={location.lng}
      latitude={location.lat}
      anchor="center"
      data-testid="location-marker"
    >
      {/* Wrapper with larger hit area on mobile */}
      <div
        className="relative flex items-center justify-center w-11 h-11 md:w-8 md:h-8 min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px]"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="button"
        tabIndex={0}
        aria-label={`Location with ${location.totalSales} sales`}
        data-location-marker="true"
        data-location-id={location.id}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          className="w-4 h-4 md:w-3 md:h-3"
          style={{
            cursor: 'pointer',
            outline: 'none',
            position: 'relative',
            zIndex: 1,
            pointerEvents: 'none' // Prevent double-click events
          }}
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            fill={isSelected ? '#dc2626' : '#ef4444'}
          />
        </svg>
        {/* Hover tooltip (desktop only) */}
        {showTooltip && !isMobile && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
            role="tooltip"
          >
            <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg whitespace-nowrap max-w-xs">
              {tooltipContent}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent" />
            </div>
          </div>
        )}
      </div>
    </Marker>
  )
}
