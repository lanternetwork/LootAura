'use client'

import { useCallback } from 'react'
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

  return (
    <Marker
      longitude={location.lng}
      latitude={location.lat}
      anchor="center"
      data-testid="location-marker"
    >
      {/* Wrapper with larger hit area on mobile */}
      <div
        className="flex items-center justify-center w-11 h-11 md:w-8 md:h-8 min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px]"
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
          <circle
            cx="8"
            cy="8"
            r="6"
            fill={isSelected ? '#dc2626' : '#ef4444'}
          />
        </svg>
      </div>
    </Marker>
  )
}
