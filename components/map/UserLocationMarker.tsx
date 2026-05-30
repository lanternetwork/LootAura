'use client'

import { Marker } from 'react-map-gl'
import { isValidUserMapCoordinate } from '@/lib/map/isValidUserMapCoordinate'

export type UserLocationMarkerProps = {
  lat: number
  lng: number
}

/**
 * Render-only user position indicator on the marketplace map.
 * Does not participate in clustering, fetches, or viewport updates.
 */
export default function UserLocationMarker({ lat, lng }: UserLocationMarkerProps) {
  if (!isValidUserMapCoordinate(lat, lng)) {
    return null
  }

  return (
    <Marker longitude={lng} latitude={lat} anchor="center">
      <div
        role="img"
        aria-label="Your location"
        data-testid="user-location-marker"
        className="pointer-events-none relative flex h-5 w-5 items-center justify-center"
      >
        <span
          className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-blue-400 opacity-40"
          aria-hidden="true"
        />
        <span
          className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 shadow-md"
          aria-hidden="true"
        />
      </div>
    </Marker>
  )
}
