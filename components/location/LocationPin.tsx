'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { Marker, Popup } from 'react-map-gl'
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
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.(location.id)
  }, [location.id, onClick])

  const handleMouseEnter = useCallback(() => {
    if (isMobile) return
    
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    
    // Clear any existing show timeout
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
    }
    
    // Add small delay before showing to prevent flashing
    showTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true)
    }, 200)
  }, [isMobile])

  const handleMouseLeave = useCallback(() => {
    // Clear any pending show timeout
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    
    // Add small delay before hiding to prevent flashing when moving between marker and tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 100)
  }, [])

  // Get tooltip content - show first sale title or count
  const tooltipContent = location.totalSales === 1 && location.sales?.[0]
    ? location.sales[0].title || 'Yard sale'
    : `${location.totalSales} sales`

  return (
    <>
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
        </div>
      </Marker>
      {/* Hover tooltip using Popup for proper z-index handling (desktop only) */}
      {showTooltip && !isMobile && (
        <Popup
          longitude={location.lng}
          latitude={location.lat}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          className="mapboxgl-popup-tooltip"
        >
          <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg whitespace-nowrap max-w-xs">
            {tooltipContent}
          </div>
        </Popup>
      )}
    </>
  )
}
