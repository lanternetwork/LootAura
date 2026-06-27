import { isGeolocationAvailable } from '@/lib/map/geolocation'

/** Live tracking options — low maximumAge for continuous updates (not one-shot cache). */
export const USER_LOCATION_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
}

export type UserLocationWatchUpdate = {
  lat: number
  lng: number
  accuracy?: number
  timestamp: number
}

export type UserLocationWatchCallbacks = {
  onUpdate: (update: UserLocationWatchUpdate) => void
  onError?: (code: number) => void
}

export type UserLocationWatchHandle = {
  watchId: number
  stop: () => void
}

export type GeolocationLike = Pick<Geolocation, 'watchPosition' | 'clearWatch'>

/**
 * Start a single navigator.geolocation.watchPosition subscription.
 * Returns null when geolocation is unavailable. Caller must call stop() on unmount.
 */
export function startUserLocationWatch(
  callbacks: UserLocationWatchCallbacks,
  geolocation?: GeolocationLike | null
): UserLocationWatchHandle | null {
  const geo = geolocation ?? (typeof navigator !== 'undefined' ? navigator.geolocation : null)
  if (!geo?.watchPosition || !geo?.clearWatch) {
    return null
  }

  const watchId = geo.watchPosition(
    (position) => {
      callbacks.onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp ?? Date.now(),
      })
    },
    (error) => {
      callbacks.onError?.(error.code)
    },
    USER_LOCATION_WATCH_OPTIONS
  )

  return {
    watchId,
    stop: () => geo.clearWatch(watchId),
  }
}

/** Whether live GPS watch may be started (API present; permission checked at call site). */
export function canStartUserLocationWatch(): boolean {
  return isGeolocationAvailable()
}
