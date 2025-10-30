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
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        style={{
          cursor: 'pointer',
          outline: 'none',
          position: 'relative',
          zIndex: 1
        }}
        data-location-marker="true"
        data-location-id={location.id}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Location with ${location.totalSales} sales`}
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          fill={isSelected ? '#dc2626' : '#ef4444'}
        />
      </svg>
    </Marker>
  )
}
