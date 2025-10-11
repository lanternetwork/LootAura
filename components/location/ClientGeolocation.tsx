'use client'

import { useEffect, useState } from 'react'

interface ClientGeolocationProps {
  onLocationFound: (lat: number, lng: number, accuracy?: number) => void
  onLocationError: (error: string) => void
}

export default function ClientGeolocation({ onLocationFound, onLocationError }: ClientGeolocationProps) {
  const [isRequesting, setIsRequesting] = useState(false)

  useEffect(() => {
    // Only try client geolocation if we're in the browser and haven't already requested
    if (typeof window === 'undefined' || isRequesting) return

    setIsRequesting(true)

    if (!navigator.geolocation) {
      onLocationError('Geolocation not supported')
      return
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000 // 5 minutes
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        console.log('[CLIENT_GEOLOCATION] Got location:', { latitude, longitude, accuracy })
        onLocationFound(latitude, longitude, accuracy)
      },
      (error) => {
        console.log('[CLIENT_GEOLOCATION] Error:', error.message)
        onLocationError(error.message)
      },
      options
    )
  }, [onLocationFound, onLocationError, isRequesting])

  return null // This component doesn't render anything
}
