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
      <div
        className={`
          w-2 h-2 bg-red-500 rounded-full shadow-sm
          hover:bg-red-600 
          transition-all duration-200
          cursor-pointer
          ${isSelected ? 'ring-1 ring-white outline outline-1 outline-red-500' : ''}
        `}
        style={{
          outline: 'none',
          boxShadow: 'none',
          border: 'none',
          background: 'red',
          borderRadius: '50%'
        }}
        data-pin-marker="true"
        data-pin-id={id}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Sale pin ${id}`}
        title={`Sale ${id}`}
      />
    </Marker>
  )
}
