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
  const { loading } = useLocation()
  const [isRecenterLoading, setIsRecenterLoading] = useState(false)

  const handleRecenter = useCallback(async () => {
    setIsRecenterLoading(true)
    
    try {
      // Always request fresh browser GPS (never use cached location)
      let freshLocation: { lat: number; lng: number } | null = null
      let permissionError: string | null = null

      try {
        // Request permission and get fresh location
        if (navigator.geolocation) {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // maximumAge: 0 forces fresh location
            )
          })
          
          freshLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        } else {
          permissionError = 'Geolocation is not supported by your browser.'
        }
      } catch (error: any) {
        // Handle permission denied or other errors
        if (error.code === 1) {
          permissionError = 'Location access is disabled. You can re-enable it by refreshing the page or signing back in.'
        } else {
          permissionError = 'Unable to get your location. Please try again.'
        }
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[RecenterButton] Geolocation error:', error)
        }
      }

      // If permission denied, show error (but don't permanently disable button)
      if (permissionError) {
        // TODO: Show inline error message to user
        // For now, just log it
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[RecenterButton] Permission error:', permissionError)
        }
        setIsRecenterLoading(false)
        return
      }

      // If we have fresh location, use it
      if (freshLocation) {
        onRecenter(freshLocation, defaultZoom)
        setIsRecenterLoading(false)
        return
      }

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
  }, [onRecenter, defaultCenter, defaultZoom])

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

