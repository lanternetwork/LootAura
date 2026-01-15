'use client'

import { useCallback } from 'react'
import { Marker } from 'react-map-gl'

interface PinMarkerProps {
  id: string
  lat: number
  lng: number
  isSelected?: boolean
  isFeatured?: boolean
  onClick?: (saleId: string) => void
}

export default function PinMarker({ 
  id, 
  lat, 
  lng, 
  isSelected = false,
  isFeatured = false,
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
      {/* Wrapper with larger hit area on mobile */}
      <div
        className={`flex items-center justify-center w-11 h-11 md:w-8 md:h-8 min-w-[44px] min-h-[44px] md:min-w-[32px] md:min-h-[32px] transition-transform duration-150 ease-out ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Sale pin ${id}`}
        data-pin-marker="true"
        data-pin-id={id}
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
              <circle
                cx="8"
                cy="8"
                r="7"
                fill="none"
                stroke={isSelected ? '#d97706' : '#f59e0b'}
                strokeWidth="1"
                opacity="0"
                className="md:hover:opacity-30 transition-opacity"
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
              {/* Subtle ring on hover (desktop only) */}
              <circle
                cx="8"
                cy="8"
                r="7"
                fill="none"
                stroke={isSelected ? '#dc2626' : '#ef4444'}
                strokeWidth="1"
                opacity="0"
                className="md:hover:opacity-30 transition-opacity"
              />
            </>
          )}
        </svg>
      </div>
    </Marker>
  )
}
