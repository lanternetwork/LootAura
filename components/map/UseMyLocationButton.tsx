'use client'

import { useState, useCallback } from 'react'
import { requestGeolocation, isGeolocationAvailable, type GeolocationError } from '@/lib/map/geolocation'

interface UseMyLocationButtonProps {
  onLocationFound: (lat: number, lng: number, source: 'gps' | 'ip') => void
  onError?: (error: GeolocationError) => void
  className?: string
  hasLocationPermission?: boolean
}

/**
 * Desktop "Use my location" button
 * 
 * Discreet control that requests device geolocation on click.
 * Shows loading state during request and handles errors gracefully.
 */
export default function UseMyLocationButton({
  onLocationFound,
  onError,
  className = '',
  hasLocationPermission = false
}: UseMyLocationButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = useCallback(async () => {
    // Don't show loading state if geolocation is not available - fallback immediately
    if (!isGeolocationAvailable()) {
      // Try IP geolocation fallback immediately (no loading state)
      try {
        const ipRes = await fetch('/api/geolocation/ip')
        if (ipRes.ok) {
          const ipData = await ipRes.json()
          if (ipData.lat && ipData.lng) {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[USE_MY_LOCATION] Desktop: Using IP geolocation fallback (GPS unavailable):', ipData)
            }
            onLocationFound(ipData.lat, ipData.lng, 'ip')
            return
          }
        }
      } catch (ipError) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[USE_MY_LOCATION] Desktop: IP geolocation fallback failed:', ipError)
        }
      }
      
      const err: GeolocationError = {
        code: 0,
        message: 'Geolocation is not available in this browser'
      }
      onError?.(err)
      setError('Location services not available')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Desktop-friendly geolocation: use low accuracy for network-based positioning
      // This works on machines without GPS hardware and is faster
      let location
      try {
        location = await requestGeolocation({
          enableHighAccuracy: false, // Desktop-friendly: network-based positioning
          timeout: 10000, // 10 seconds - shorter timeout for faster fallback
          maximumAge: 600000 // 10 minutes - accept cached location
        })
      } catch (highAccuracyError) {
        // If low accuracy also fails, try with even more lenient settings
        const error = highAccuracyError as { code?: number; message?: string }
        if (error.code === 3) { // TIMEOUT
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[USE_MY_LOCATION] Desktop: GPS timed out, trying IP geolocation fallback')
          }
          // Fallback to IP geolocation on timeout
          try {
            const ipRes = await fetch('/api/geolocation/ip')
            if (ipRes.ok) {
              const ipData = await ipRes.json()
              if (ipData.lat && ipData.lng) {
                if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                  console.log('[USE_MY_LOCATION] Desktop: Using IP geolocation fallback:', ipData)
                }
                onLocationFound(ipData.lat, ipData.lng, 'ip')
                setIsLoading(false)
                return // Success with IP fallback - exit early
              }
            }
          } catch (ipError) {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.error('[USE_MY_LOCATION] Desktop: IP geolocation fallback failed:', ipError)
            }
          }
          // If IP fallback also fails, throw the original timeout error
          throw highAccuracyError
        } else {
          // For non-timeout errors (permission denied, etc.), try IP fallback
          if (error.code === 2) { // POSITION_UNAVAILABLE
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[USE_MY_LOCATION] Desktop: GPS unavailable, trying IP geolocation fallback')
            }
            try {
              const ipRes = await fetch('/api/geolocation/ip')
              if (ipRes.ok) {
                const ipData = await ipRes.json()
                if (ipData.lat && ipData.lng) {
                  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                    console.log('[USE_MY_LOCATION] Desktop: Using IP geolocation fallback:', ipData)
                  }
                  onLocationFound(ipData.lat, ipData.lng)
                  setIsLoading(false)
                  return // Success with IP fallback - exit early
                }
              }
            } catch (ipError) {
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.error('[USE_MY_LOCATION] Desktop: IP geolocation fallback failed:', ipError)
              }
            }
          }
          // Re-throw non-timeout errors (permission denied, etc.)
          throw highAccuracyError
        }
      }

      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[USE_MY_LOCATION] Desktop: Location found:', location)
      }

      onLocationFound(location.lat, location.lng, 'gps')
    } catch (err) {
      const geoError = err as GeolocationError
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[USE_MY_LOCATION] Desktop: Error:', geoError)
      }

      onError?.(geoError)
      
      // Set user-friendly error message
      if (geoError.code === 1) {
        setError('Location access denied')
      } else if (geoError.code === 2) {
        setError('Location unavailable')
      } else if (geoError.code === 3) {
        setError('Location request timed out')
      } else {
        setError('Failed to get location')
      }
      
      // Clear error message after 3 seconds
      setTimeout(() => setError(null), 3000)
    } finally {
      // Always clear loading state, even if we used IP fallback
      setIsLoading(false)
    }
  }, [onLocationFound, onError])

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`
          flex items-center gap-2 px-3 py-2 
          bg-white border border-gray-300 rounded-lg shadow-sm
          hover:bg-gray-50 hover:border-gray-400
          disabled:opacity-50 disabled:cursor-not-allowed
          text-sm font-medium text-gray-700
          transition-colors
        `}
        aria-label={hasLocationPermission ? "Recenter map" : "Use my location"}
        title={hasLocationPermission ? "Recenter map on your location" : "Center map on your current location"}
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
            <span>Locating...</span>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>{hasLocationPermission ? "Recenter map" : "Use my location"}</span>
          </>
        )}
      </button>
      {error && (
        <div
          className="absolute top-full left-0 mt-1 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-700 whitespace-nowrap z-50"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  )
}
