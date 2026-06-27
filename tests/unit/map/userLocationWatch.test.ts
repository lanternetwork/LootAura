import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  startUserLocationWatch,
  USER_LOCATION_WATCH_OPTIONS,
  canStartUserLocationWatch,
} from '@/lib/map/userLocationWatch'

describe('userLocationWatch', () => {
  const watchPosition = vi.fn()
  const clearWatch = vi.fn()

  const mockGeo = {
    watchPosition,
    clearWatch,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    watchPosition.mockReturnValue(42)
  })

  it('registers watchPosition with live tracking options', () => {
    const onUpdate = vi.fn()
    startUserLocationWatch({ onUpdate }, mockGeo)

    expect(watchPosition).toHaveBeenCalledTimes(1)
    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      USER_LOCATION_WATCH_OPTIONS
    )
    expect(USER_LOCATION_WATCH_OPTIONS).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
    })
  })

  it('invokes onUpdate on watch callback', () => {
    const onUpdate = vi.fn()
    startUserLocationWatch({ onUpdate }, mockGeo)

    const success = watchPosition.mock.calls[0]![0] as PositionCallback
    success({
      coords: {
        latitude: 38.25,
        longitude: -85.76,
        accuracy: 12,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: 1_700_000_000_000,
    } as GeolocationPosition)

    expect(onUpdate).toHaveBeenCalledWith({
      lat: 38.25,
      lng: -85.76,
      accuracy: 12,
      timestamp: 1_700_000_000_000,
    })
  })

  it('invokes onError on watch failure', () => {
    const onError = vi.fn()
    startUserLocationWatch({ onUpdate: vi.fn(), onError }, mockGeo)

    const fail = watchPosition.mock.calls[0]![1] as PositionErrorCallback
    fail({ code: 2, message: 'unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })

    expect(onError).toHaveBeenCalledWith(2)
  })

  it('stop clears watch by id', () => {
    const handle = startUserLocationWatch({ onUpdate: vi.fn() }, mockGeo)
    expect(handle).not.toBeNull()
    handle!.stop()
    expect(clearWatch).toHaveBeenCalledWith(42)
  })

  it('returns null when geolocation missing', () => {
    const handle = startUserLocationWatch({ onUpdate: vi.fn() }, null)
    expect(handle).toBeNull()
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('canStartUserLocationWatch reflects navigator presence', () => {
    expect(typeof canStartUserLocationWatch()).toBe('boolean')
  })
})
