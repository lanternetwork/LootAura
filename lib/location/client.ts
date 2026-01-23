/**
 * Client-side location utilities with graceful fallback
 * Handles geolocation API with proper error handling and user feedback
 */

import { isDebugEnabled } from '@/lib/debug'

export interface LocationResult {
  lat: number
  lng: number
  accuracy?: number
  source: 'geolocation' | 'ip' | 'fallback'
  city?: string
  state?: string
  country?: string
}

export interface LocationError {
  code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNKNOWN'
  message: string
}

/**
 * Get user's current location using IP geolocation (no browser prompt)
 * Note: Browser geolocation is skipped to avoid permission prompts
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  // Use IP geolocation directly (no browser prompt)
  try {
    return await getIPLocation()
  } catch (error) {
    if (isDebugEnabled) {
      console.warn('IP geolocation failed, using fallback location:', error)
    }
    return getFallbackLocation()
  }
}

/**
 * Get location using navigator.geolocation with proper error handling
 */
function getGeolocationPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000 // 5 minutes
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(position)
      },
      (error) => {
        let errorCode: LocationError['code']
        let message: string

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorCode = 'PERMISSION_DENIED'
            message = 'Location access denied. Please enable location permissions.'
            break
          case error.POSITION_UNAVAILABLE:
            errorCode = 'POSITION_UNAVAILABLE'
            message = 'Location information unavailable.'
            break
          case error.TIMEOUT:
            errorCode = 'TIMEOUT'
            message = 'Location request timed out.'
            break
          default:
            errorCode = 'UNKNOWN'
            message = 'An unknown error occurred while retrieving location.'
        }

        reject({ code: errorCode, message })
      },
      options
    )
  })
}

/**
 * Get location using IP geolocation as fallback
 */
async function getIPLocation(): Promise<LocationResult> {
  try {
    const response = await fetch('/api/geolocation/ip')
    if (!response.ok) {
      throw new Error('IP geolocation failed')
    }

    const data = await response.json()
    return {
      lat: data.lat,
      lng: data.lng,
      source: 'ip',
      city: data.city,
      state: data.state,
      country: data.country
    }
  } catch (error) {
    if (isDebugEnabled) {
      console.error('IP geolocation error:', error)
    }
    throw error
  }
}

/**
 * Get fallback location - should never be called in production
 * This is a last resort that indicates a system failure
 */
function getFallbackLocation(): LocationResult {
  if (isDebugEnabled) {
    console.error('CRITICAL: All location detection methods failed - this should not happen in production')
  }
  return {
    lat: 39.8283,
    lng: -98.5795,
    source: 'fallback',
    city: 'United States',
    state: 'US',
    country: 'US'
  }
}

/**
 * Check if geolocation is supported
 */
export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator
}

/**
 * Check if geolocation permissions are granted
 * Note: This does NOT request geolocation - it only checks permission state
 */
export async function checkGeolocationPermission(): Promise<boolean> {
  if (!isGeolocationSupported()) {
    return false
  }

  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return permission.state === 'granted'
  } catch (error) {
    // Permission query failed - don't request geolocation as fallback (would trigger prompt)
    // Return false instead
    return false
  }
}

/**
 * Request geolocation permission
 */
export async function requestGeolocationPermission(): Promise<boolean> {
  if (!isGeolocationSupported()) {
    return false
  }

  try {
    await getGeolocationPosition()
    return true
  } catch (error) {
    return false
  }
}

/**
 * Format location for display
 */
export function formatLocation(location: LocationResult): string {
  if (location.city && location.state) {
    return `${location.city}, ${location.state}`
  }
  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
}

/**
 * Calculate distance between two points using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Convert kilometers to miles
 */
export function kmToMiles(km: number): number {
  return km * 0.621371
}

