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
        data-location-marker="true"
        data-location-id={location.id}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Location with ${location.totalSales} sales`}
        title={`${location.totalSales} sales at this location`}
      />
    </Marker>
  )
}
