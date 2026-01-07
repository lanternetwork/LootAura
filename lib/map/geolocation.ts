/**
 * Geolocation utilities with gating and denial tracking
 * 
 * Handles device geolocation requests with proper gating:
 * - Only prompts when appropriate (mobile on mount, desktop on button click)
 * - Tracks denial state to avoid repeated prompts
 * - Respects user interaction to prevent surprise recentering
 */

const GEO_DENIED_KEY = 'geo:denied'
const GEO_DENIED_TIMESTAMP_KEY = 'geo:denied:timestamp'
// Don't reprompt for 30 days after denial
const DENIAL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

export interface GeolocationResult {
  lat: number
  lng: number
  accuracy?: number
}

export interface GeolocationError {
  code: number
  message: string
}

/**
 * Check if geolocation was previously denied
 */
export function isGeolocationDenied(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false
  }

  try {
    const denied = localStorage.getItem(GEO_DENIED_KEY)
    if (denied !== 'true') {
      return false
    }

    // Check if denial is still within cooldown period
    const deniedTimestamp = localStorage.getItem(GEO_DENIED_TIMESTAMP_KEY)
    if (deniedTimestamp) {
      const timestamp = parseInt(deniedTimestamp, 10)
      if (!isNaN(timestamp)) {
        const age = Date.now() - timestamp
        if (age < DENIAL_COOLDOWN_MS) {
          return true
        }
        // Cooldown expired, clear denial flag
        clearGeolocationDenial()
        return false
      }
    }

    // If flag is set but no valid timestamp, still consider it denied
    // (backwards compatibility for old denial state)
    return true
  } catch {
    return false
  }
}

/**
 * Mark geolocation as denied
 */
export function setGeolocationDenied(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(GEO_DENIED_KEY, 'true')
    localStorage.setItem(GEO_DENIED_TIMESTAMP_KEY, Date.now().toString())
  } catch (error) {
    // Silently fail - localStorage may be unavailable
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[GEO] Failed to save denial state:', error)
    }
  }
}

/**
 * Clear geolocation denial state
 */
export function clearGeolocationDenial(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.removeItem(GEO_DENIED_KEY)
    localStorage.removeItem(GEO_DENIED_TIMESTAMP_KEY)
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[GEO] Failed to clear denial state:', error)
    }
  }
}

/**
 * Check if geolocation API is available
 */
export function isGeolocationAvailable(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }
  return 'geolocation' in navigator
}

/**
 * Request device geolocation
 * 
 * @param options - Geolocation options
 * @returns Promise resolving to location or rejecting with error
 */
export function requestGeolocation(
  options: {
    enableHighAccuracy?: boolean
    timeout?: number
    maximumAge?: number
  } = {}
): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationAvailable()) {
      reject({
        code: 0,
        message: 'Geolocation API not available'
      } as GeolocationError)
      return
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 10000, // 10 seconds
      maximumAge: 300000 // 5 minutes
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
      },
      (error) => {
        const geoError: GeolocationError = {
          code: error.code,
          message: error.message
        }

        // Track denial for permission denied errors
        // Use numeric constant (1) instead of error.PERMISSION_DENIED for reliability
        if (error.code === 1) {
          setGeolocationDenied()
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[GEO] Permission denied, tracking denial state')
          }
        }

        reject(geoError)
      },
      { ...defaultOptions, ...options }
    )
  })
}

/**
 * Check if device is mobile based on viewport width
 * Uses 768px breakpoint (md in Tailwind)
 */
export function isMobileBreakpoint(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.innerWidth < 768
}
