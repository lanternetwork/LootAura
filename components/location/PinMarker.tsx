'use client'

import { useCallback } from 'react'
import { Marker } from 'react-map-gl'

interface PinMarkerProps {
  id: string
  lat: number
  lng: number
  isSelected?: boolean
  onClick?: (saleId: string) => void
}

export default function PinMarker({ 
  id, 
  lat, 
  lng, 
  isSelected = false,
  onClick 
}: PinMarkerProps) {
  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.(id)
  }, [id, onClick])

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="center"
      data-testid="marker"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        style={{
          cursor: 'pointer',
          outline: 'none',
          position: 'relative',
          zIndex: 1
        }}
        data-pin-marker="true"
        data-pin-id={id}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Sale pin ${id}`}
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
