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
      <button
        className={`
          w-3 h-3 bg-red-500 rounded-full shadow-sm
          hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500
          transition-all duration-200
          cursor-pointer
          ${isSelected ? 'ring-2 ring-white outline outline-2 outline-red-500' : ''}
        `}
        data-pin-marker="true"
        data-pin-id={id}
        onClick={handleClick}
        aria-label={`Sale pin ${id}`}
        title={`Sale ${id}`}
      />
    </Marker>
  )
}
