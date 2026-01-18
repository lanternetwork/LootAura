'use client'

import { useCallback, useMemo } from 'react'
import { Marker } from 'react-map-gl'
import { LocationGroup } from '@/lib/pins/types'

interface LocationPinProps {
  location: LocationGroup
  isSelected?: boolean
  onClick?: (locationId: string) => void
}

/**
 * Detect if device has touch capability (not device type)
 * Uses pointer capability detection, not user agent
 */
function hasTouchCapability(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export default function LocationPin({ 
  location, 
  isSelected = false,
  onClick 
}: LocationPinProps) {
  // Detect touch capability for hitbox sizing
  const isTouchDevice = useMemo(() => hasTouchCapability(), [])

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.(location.id)
  }, [location.id, onClick])

  // Check if any sale in this location is featured
  const isFeatured = useMemo(() => {
    return location.sales?.some((s: any) => s.isFeatured === true || s.is_featured === true) || false
  }, [location.sales])

  return (
    <>
      <Marker
        longitude={location.lng}
        latitude={location.lat}
        anchor="center"
        data-testid="location-marker"
      >
        {/* Platform-specific hitbox: tight on desktop, forgiving on touch */}
        <div
          className={`relative flex items-center justify-center transition-transform duration-150 ease-out ${
            isSelected ? 'scale-125' : 'hover:scale-110'
          }`}
          style={{
            // Desktop (mouse): tight hitbox matching SVG size (12px on desktop)
            // Mobile (touch): larger hitbox (44px) for easier tapping
            width: isTouchDevice ? '44px' : '12px',
            height: isTouchDevice ? '44px' : '12px',
            minWidth: isTouchDevice ? '44px' : '12px',
            minHeight: isTouchDevice ? '44px' : '12px',
            // Ensure extra hit area on touch devices is transparent
            backgroundColor: isTouchDevice ? 'transparent' : undefined
          }}
          onClick={handleClick}
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
                {/* Subtle ring on hover */}
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
                {/* Subtle ring on hover */}
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
              </>
            )}
          </svg>
        </div>
      </Marker>
    </>
  )
}
