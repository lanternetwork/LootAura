'use client'

import { useState, useEffect, useCallback } from 'react'
import { getGeolocationPermissionState, requestGeolocationPermission } from '@/lib/location/client'
import LocationPermissionDenied from './LocationPermissionDenied'

type PermissionState = 'unknown' | 'granted' | 'denied'

interface UnifiedLocationButtonProps {
  userLocation: { lat: number; lng: number } | null
  mapView: { center: { lat: number; lng: number }; zoom: number; bounds: { west: number; south: number; east: number; north: number } } | null
  onRecenter: (location: { lat: number; lng: number }, zoom: number) => void
  mapRef: React.RefObject<any>
}

/**
 * Unified location control button for mobile/tablet.
 * Handles permission request, recenter, and denied state with stable visibility.
 */
export default function UnifiedLocationButton({
  userLocation,
  mapView,
  onRecenter,
  mapRef
}: UnifiedLocationButtonProps) {
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown')
  const [isRequestingLocation, setIsRequestingLocation] = useState(false)
  const [hasUserClickedLocation, setHasUserClickedLocation] = useState(false)
  const [showPermissionDenied, setShowPermissionDenied] = useState(false)

  // Check permission state on mount
  useEffect(() => {
    getGeolocationPermissionState().then(setPermissionState)
  }, [])

  // Calculate if user location is outside viewport
  const isLocationOutsideViewport = useCallback(() => {
    if (!userLocation || !mapView?.bounds) return true
    
    const { lat, lng } = userLocation
    const { west, south, east, north } = mapView.bounds
    
    return lat < south || lat > north || lng < west || lng > east
  }, [userLocation, mapView?.bounds])

  // Button visibility logic - stable during permission requests
  const shouldShowButton = useCallback(() => {
    // Desktop: never show
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) return false
    
    // Always show while requesting (prevents flicker)
    if (isRequestingLocation) return true
    
    // Show if permission is unknown (user hasn't requested yet)
    if (permissionState === 'unknown') return true
    
    // Show if permission is denied (user can see disabled state)
    if (permissionState === 'denied') return true
    
    // Show if permission is granted but location is outside viewport
    if (permissionState === 'granted' && userLocation && isLocationOutsideViewport()) return true
    
    return false
  }, [permissionState, isRequestingLocation, userLocation, isLocationOutsideViewport])

  // Recenter map using fresh GPS
  const handleRecenter = useCallback(async () => {
    if (!mapRef.current) return
    
    const map = mapRef.current.getMap?.()
    if (!map) return

    setIsRequestingLocation(true)

    try {
      // Always request fresh browser GPS (never use cached location)
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // maximumAge: 0 forces fresh location
        )
      })
      
      const freshLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }

      const DEFAULT_ZOOM = 12
      const latRange = 0.11
      const lngRange = latRange * Math.cos(freshLocation.lat * Math.PI / 180)
      const newBounds = {
        west: freshLocation.lng - lngRange / 2,
        south: freshLocation.lat - latRange / 2,
        east: freshLocation.lng + lngRange / 2,
        north: freshLocation.lat + latRange / 2
      }

      const currentCenter = map.getCenter()
      const currentLat = currentCenter.lat
      const currentLng = currentCenter.lng
      const distance = Math.sqrt(
        Math.pow((freshLocation.lat - currentLat) * 111, 2) + 
        Math.pow((freshLocation.lng - currentLng) * 111 * Math.cos(currentLat * Math.PI / 180), 2)
      )
      const duration = Math.min(3000, Math.max(1000, distance * 50))

      const handleMoveEnd = () => {
        onRecenter(freshLocation, DEFAULT_ZOOM)
      }

      map.once('moveend', handleMoveEnd)

      map.flyTo({
        center: [freshLocation.lng, freshLocation.lat],
        zoom: DEFAULT_ZOOM,
        duration: duration,
        essential: true
      })
    } catch (error: any) {
      // Handle permission denied or other errors
      if (error.code === 1) {
        setPermissionState('denied')
      }
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[UNIFIED_LOCATION] Geolocation error:', error)
      }
    } finally {
      setIsRequestingLocation(false)
    }
  }, [mapRef, onRecenter])

  // Handle button click
  const handleClick = useCallback(async () => {
    setHasUserClickedLocation(true)

    if (permissionState === 'unknown') {
      // Request permission
      setIsRequestingLocation(true)
      try {
        const granted = await requestGeolocationPermission()
        if (granted) {
          setPermissionState('granted')
          // After permission granted, recenter
          await handleRecenter()
        }
      } catch (error: any) {
        // Check if error is permission denied
        if (error.code === 'PERMISSION_DENIED' || error.code === 1) {
          setPermissionState('denied')
        } else {
          // Other error - keep as unknown (don't treat as denied)
          setPermissionState('unknown')
        }
      } finally {
        setIsRequestingLocation(false)
      }
    } else if (permissionState === 'denied') {
      // Show message on click when denied
      setShowPermissionDenied(true)
    } else if (permissionState === 'granted') {
      // Recenter map
      await handleRecenter()
    }
  }, [permissionState, handleRecenter])

  const visible = shouldShowButton()
  if (!visible) return null

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleClick()
        }}
        disabled={isRequestingLocation}
        className={`lg:hidden absolute bottom-[152px] right-4 pointer-events-auto bg-white hover:bg-gray-50 shadow-lg rounded-full p-3 min-w-[48px] min-h-[48px] flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${permissionState === 'denied' ? 'opacity-60' : ''}`}
        aria-label={
          permissionState === 'granted' 
            ? "Recenter map to your location" 
            : permissionState === 'denied'
            ? "Location access is disabled"
            : "Use my location"
        }
      >
        {isRequestingLocation ? (
          <svg className="w-6 h-6 text-gray-700 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : permissionState === 'denied' ? (
          // Muted/crossed-out location icon for denied state
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" stroke="currentColor" opacity="0.6" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>

      {/* Permission denied message - only show on click when denied */}
      {showPermissionDenied && hasUserClickedLocation && permissionState === 'denied' && (
        <LocationPermissionDenied
          onDismiss={() => setShowPermissionDenied(false)}
        />
      )}
    </>
  )
}

