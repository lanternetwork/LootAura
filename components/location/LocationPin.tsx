'use client'

import { useCallback, useMemo } from 'react'
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
        {/* Wrapper with larger hit area on mobile */}
        <div
          className={`relative flex items-center justify-center w-11 h-11 md:w-8 md:h-8 min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px] transition-transform duration-150 ease-out ${
            isSelected ? 'scale-125' : 'hover:scale-110'
          }`}
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
