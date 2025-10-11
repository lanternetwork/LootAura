/**
 * Client-side location utilities with graceful fallback
 * Handles geolocation API with proper error handling and user feedback
 */

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
 * Get user's current location using navigator.geolocation
 * Falls back to IP geolocation if geolocation fails
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  // Try geolocation first
  if (navigator.geolocation) {
    try {
      const position = await getGeolocationPosition()
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        source: 'geolocation'
      }
    } catch (error) {
      console.warn('Geolocation failed, falling back to IP geolocation:', error)
    }
  }

  // Fallback to IP geolocation
  try {
    return await getIPLocation()
  } catch (error) {
    console.warn('IP geolocation failed, using fallback location:', error)
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
    console.error('IP geolocation error:', error)
    throw error
  }
}

/**
 * Get fallback location (Louisville, KY)
 */
function getFallbackLocation(): LocationResult {
  return {
    lat: 38.2527,
    lng: -85.7585,
    source: 'fallback',
    city: 'Louisville',
    state: 'KY',
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
 */
export async function checkGeolocationPermission(): Promise<boolean> {
  if (!isGeolocationSupported()) {
    return false
  }

  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return permission.state === 'granted'
  } catch (error) {
    // Fallback: try to get position with very short timeout
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { timeout: 1000, maximumAge: 60000 }
      )
    })
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

/**
 * Convert miles to kilometers
 * @deprecated Use utils/geo.ts instead
 */
export function milesToKm(miles: number): number {
  return miles * 1.60934
}
