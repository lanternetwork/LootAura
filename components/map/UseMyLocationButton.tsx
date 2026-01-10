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
    let resolvedLocation: { lat: number; lng: number; source: 'gps' | 'ip' } | null = null

    // If permission already granted, skip IP and spinner, go straight to GPS
    if (hasLocationPermission) {
      if (!isGeolocationAvailable()) {
        return
      }
      // No spinner - permission already granted, GPS should be fast
      requestGeolocation({
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000
      }).then((location) => {
        if (!resolvedLocation) {
          resolvedLocation = { lat: location.lat, lng: location.lng, source: 'gps' }
          onLocationFound(location.lat, location.lng, 'gps')
        }
      }).catch((err) => {
        const geoError = err as GeolocationError
        onError?.(geoError)
      })
      return
    }

    // Permission not granted - wait for permission prompt resolution before recentering
    // Don't recenter with IP immediately - wait for user to respond to permission prompt
    if (!isGeolocationAvailable()) {
      // GPS not available - fallback to IP
      try {
        const ipRes = await fetch('/api/geolocation/ip')
        if (ipRes.ok) {
          const ipData = await ipRes.json()
          if (ipData.lat && ipData.lng) {
            onLocationFound(ipData.lat, ipData.lng, 'ip')
          }
        }
      } catch {
        // Ignore IP errors
      }
      return
    }

    setIsLoading(true)
    setError(null)

    // Request GPS - this will show permission prompt
    // Wait for user response before recentering
    requestGeolocation({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 600000
    }).then((location) => {
      // Permission granted - recenter with GPS location
      onLocationFound(location.lat, location.lng, 'gps')
      setIsLoading(false)
    }).catch((err) => {
      const geoError = err as GeolocationError
      onError?.(geoError)
      
      // If permission denied or error, fallback to IP
      if (geoError.code === 1) {
        setError('Location access denied')
        // Fallback to IP when permission denied
        fetch('/api/geolocation/ip').then(ipRes => {
          if (ipRes.ok) {
            return ipRes.json()
          }
          return null
        }).then(ipData => {
          if (ipData?.lat && ipData?.lng) {
            onLocationFound(ipData.lat, ipData.lng, 'ip')
          }
          setIsLoading(false)
        }).catch(() => {
          setIsLoading(false)
        })
      } else if (geoError.code === 2) {
        setError('Location unavailable')
        // Fallback to IP when unavailable
        fetch('/api/geolocation/ip').then(ipRes => {
          if (ipRes.ok) {
            return ipRes.json()
          }
          return null
        }).then(ipData => {
          if (ipData?.lat && ipData?.lng) {
            onLocationFound(ipData.lat, ipData.lng, 'ip')
          }
          setIsLoading(false)
        }).catch(() => {
          setIsLoading(false)
        })
      } else if (geoError.code === 3) {
        setError('Location request timed out')
        // Fallback to IP on timeout
        fetch('/api/geolocation/ip').then(ipRes => {
          if (ipRes.ok) {
            return ipRes.json()
          }
          return null
        }).then(ipData => {
          if (ipData?.lat && ipData?.lng) {
            onLocationFound(ipData.lat, ipData.lng, 'ip')
          }
          setIsLoading(false)
        }).catch(() => {
          setIsLoading(false)
        })
      } else {
        setError('Failed to get location')
        setIsLoading(false)
      }
      setTimeout(() => setError(null), 3000)
    })
  }, [onLocationFound, onError, hasLocationPermission])

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
