/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

declare global {
  namespace Vi {
    interface JestAssertion<T = any> extends jest.Matchers<void, T> {}
  }
}

// Extend Vitest's expect with jest-dom matchers
import '@testing-library/jest-dom'

// Mock types for DOM APIs not available in JSDOM
declare global {
  interface Window {
    ResizeObserver: typeof ResizeObserver
    IntersectionObserver: typeof IntersectionObserver
    matchMedia: typeof matchMedia
  }
  
  interface Navigator {
    geolocation: Geolocation
  }
  
  interface Geolocation {
    getCurrentPosition: (successCallback: PositionCallback, errorCallback?: PositionErrorCallback, options?: PositionOptions) => void
    watchPosition: (successCallback: PositionCallback, errorCallback?: PositionErrorCallback, options?: PositionOptions) => number
    clearWatch: (watchId: number) => void
  }
  
  interface PositionCallback {
    (position: GeolocationPosition): void
  }
  
  interface PositionErrorCallback {
    (error: GeolocationPositionError): void
  }
  
  interface PositionOptions {
    enableHighAccuracy?: boolean
    timeout?: number
    maximumAge?: number
  }
  
  interface GeolocationPosition {
    coords: GeolocationCoordinates
    timestamp: number
  }
  
  interface GeolocationCoordinates {
    latitude: number
    longitude: number
    altitude: number | null
    accuracy: number
    altitudeAccuracy: number | null
    heading: number | null
    speed: number | null
  }
  
  interface GeolocationPositionError {
    code: number
    message: string
  }
}

export {}
