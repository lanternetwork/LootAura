'use client'

import { useCallback, useState, useEffect, useRef, useMemo } from 'react'
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

  // Hide tooltip when pin becomes selected (card is visible)
  useEffect(() => {
    if (isSelected && showTooltip) {
      // Clear any pending show timeout
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current)
        showTimeoutRef.current = null
      }
      // Hide tooltip immediately
      setShowTooltip(false)
    }
  }, [isSelected, showTooltip])

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.(location.id)
  }, [location.id, onClick])

  const handleMouseEnter = useCallback(() => {
    if (isMobile || isSelected) return // Don't show tooltip on mobile or when card is already visible
    
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
  }, [isMobile, isSelected])

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

  // Check if any sale in this location is featured
  const isFeatured = useMemo(() => {
    return location.sales?.some((s: any) => s.isFeatured === true || s.is_featured === true) || false
  }, [location.sales])

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
          className={`relative flex items-center justify-center w-11 h-11 md:w-8 md:h-8 min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px] transition-transform duration-150 ease-out ${
            isSelected ? 'scale-125' : 'hover:scale-110'
          }`}
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
            {/* Featured pins: amber/gold with subtle stroke; Regular pins: red */}
            {isFeatured ? (
              <>
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill={isSelected ? '#d97706' : '#f59e0b'}
                  stroke={isSelected ? '#b45309' : '#d97706'}
                  strokeWidth="1.5"
                  className={isSelected ? 'drop-shadow-lg' : ''}
                />
                {/* Subtle ring on hover (desktop only) */}
                {!isMobile && (
                  <circle
                    cx="8"
                    cy="8"
                    r="7"
                    fill="none"
                    stroke={isSelected ? '#d97706' : '#f59e0b'}
                    strokeWidth="1"
                    opacity="0.3"
                    className="hover:opacity-50 transition-opacity"
                  />
                )}
              </>
            ) : (
              <>
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill={isSelected ? '#dc2626' : '#ef4444'}
                  className={isSelected ? 'drop-shadow-lg' : ''}
                />
                {/* Subtle ring on hover (desktop only) */}
                {!isMobile && (
                  <circle
                    cx="8"
                    cy="8"
                    r="7"
                    fill="none"
                    stroke={isSelected ? '#dc2626' : '#ef4444'}
                    strokeWidth="1"
                    opacity="0.3"
                    className="hover:opacity-50 transition-opacity"
                  />
                )}
              </>
            )}
          </svg>
        </div>
      </Marker>
      {/* Hover tooltip using Popup for proper z-index handling (desktop only) */}
      {/* Don't show tooltip when pin is selected (card is visible) to avoid overlap */}
      {showTooltip && !isMobile && !isSelected && (
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
