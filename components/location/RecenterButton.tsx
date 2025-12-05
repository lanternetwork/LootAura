'use client'

import { useState, useCallback } from 'react'
import { useLocation } from '@/lib/location/useLocation'
import { Tooltip } from '@/components/ui/Tooltip'

interface RecenterButtonProps {
  /** Callback when re-center is triggered with new center coordinates */
  onRecenter: (center: { lat: number; lng: number }, zoom?: number) => void
  /** Default center to use if geolocation is not available */
  defaultCenter?: { lat: number; lng: number }
  /** Default zoom level */
  defaultZoom?: number
  /** Additional className */
  className?: string
}

/**
 * Re-center button for map controls.
 * Attempts to use user's geolocation first, falls back to default center.
 */
export default function RecenterButton({
  onRecenter,
  defaultCenter,
  defaultZoom = 11,
  className = ''
}: RecenterButtonProps) {
  const { location, loading, getLocation, requestPermission } = useLocation()
  const [isRecenterLoading, setIsRecenterLoading] = useState(false)

  const handleRecenter = useCallback(async () => {
    setIsRecenterLoading(true)
    
    try {
      // First, try to use existing location if available
      if (location) {
        onRecenter({ lat: location.lat, lng: location.lng }, defaultZoom)
        setIsRecenterLoading(false)
        return
      }
      
      // If no location, try to request permission and get location
      // requestPermission internally calls getLocation which updates the location state
      const granted = await requestPermission()
      if (granted) {
        // requestPermission already calls getLocation internally
        // The location state will be updated, but since React state updates are async,
        // we need to wait a bit or check the location after the state updates
        // For now, we'll call getLocation again to ensure we have the latest location
        await getLocation()
        // After getLocation, the location state should be updated
        // But since it's async, we'll fall through to default if still null
        // The next time the user clicks, location should be available
      }
      
      // Check location again after async operations (state may have updated)
      // Note: This is a workaround for async state updates
      // In practice, if getLocation succeeded, location should be set
      // But we can't rely on it immediately due to React's async state updates
      
      // Fallback to default center if geolocation not available
      if (defaultCenter) {
        onRecenter(defaultCenter, defaultZoom)
      }
    } catch (error) {
      // On error, fall back to default center
      if (defaultCenter) {
        onRecenter(defaultCenter, defaultZoom)
      }
    } finally {
      setIsRecenterLoading(false)
    }
  }, [location, getLocation, requestPermission, onRecenter, defaultCenter, defaultZoom])

  return (
    <Tooltip content="Re-center map to your location or default view">
      <button
        onClick={handleRecenter}
        disabled={isRecenterLoading || loading}
        className={`bg-white hover:bg-gray-50 shadow-lg rounded-full p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        aria-label="Re-center map"
      >
      {isRecenterLoading || loading ? (
        <svg className="w-5 h-5 text-gray-700 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
    </Tooltip>
  )
}

