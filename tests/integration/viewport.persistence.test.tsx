/**
 * Integration tests for viewport persistence and geolocation
 * 
 * Tests verify:
 * - URL params take precedence over localStorage
 * - Persisted viewport is used when no URL params
 * - Mobile geolocation is requested when appropriate
 * - User interaction prevents surprise recentering
 * - Desktop geolocation only on button click
 * - Denial tracking prevents repeated prompts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveInitialViewport } from '@/lib/map/initialViewportResolver'
import { saveViewportState, loadViewportState, clearViewportState } from '@/lib/map/viewportPersistence'
import { 
  isGeolocationDenied, 
  setGeolocationDenied, 
  clearGeolocationDenial,
  isGeolocationAvailable,
  requestGeolocation
} from '@/lib/map/geolocation'

// Mock navigator.geolocation - create fresh mock in beforeEach to avoid state leakage
let mockGeolocation: {
  getCurrentPosition: ReturnType<typeof vi.fn>
  watchPosition: ReturnType<typeof vi.fn>
  clearWatch: ReturnType<typeof vi.fn>
} = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn()
}

beforeEach(() => {
  // Clear localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
  
  // Create fresh mock for each test to avoid state leakage
  mockGeolocation = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn()
  }
  
  // Mock navigator.geolocation (navigator exists in jsdom, not global.navigator)
  if (typeof navigator !== 'undefined' && navigator !== null) {
    // Delete existing property first to ensure clean state
    try {
      delete (navigator as any).geolocation
    } catch {
      // Ignore if delete fails
    }
    // Assign directly - this ensures 'geolocation' in navigator returns true
    // and navigator.geolocation points to our mock
    ;(navigator as any).geolocation = mockGeolocation
  }
  
  // Mock window.innerWidth for mobile detection
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024 // Desktop by default
    })
  }
})

afterEach(() => {
  clearViewportState()
  clearGeolocationDenial()
})

describe('InitialViewportResolver', () => {
  describe('Precedence rules', () => {
    it('should use URL params when available (highest priority)', () => {
      const result = resolveInitialViewport({
        urlLat: '38.2527',
        urlLng: '-85.7585',
        urlZoom: '12',
        initialCenter: { lat: 40.0, lng: -90.0 },
        isMobile: false,
        userInteracted: false
      })
      
      expect(result.source).toBe('url')
      expect(result.center).toEqual({ lat: 38.2527, lng: -85.7585 })
      expect(result.zoom).toBe(12)
      expect(result.viewport).toEqual({ lat: 38.2527, lng: -85.7585, zoom: 12 })
    })

    it('should ignore localStorage when URL params exist', () => {
      // Save persisted state
      saveViewportState(
        { lat: 40.0, lng: -90.0, zoom: 10 },
        { dateRange: 'any', categories: [], radius: 10 }
      )
      
      const result = resolveInitialViewport({
        urlLat: '38.2527',
        urlLng: '-85.7585',
        urlZoom: '12',
        initialCenter: null,
        isMobile: false,
        userInteracted: false
      })
      
      expect(result.source).toBe('url')
      expect(result.center).toEqual({ lat: 38.2527, lng: -85.7585 })
    })

    it('should use persisted viewport when no URL params', () => {
      saveViewportState(
        { lat: 40.0, lng: -90.0, zoom: 11 },
        { dateRange: 'any', categories: [], radius: 10 }
      )
      
      const result = resolveInitialViewport({
        urlLat: null,
        urlLng: null,
        urlZoom: null,
        initialCenter: null,
        isMobile: false,
        userInteracted: false
      })
      
      expect(result.source).toBe('persisted')
      expect(result.center).toEqual({ lat: 40.0, lng: -90.0 })
      expect(result.zoom).toBe(11)
    })

    it('should signal geolocation for mobile when no URL/persisted', () => {
      const result = resolveInitialViewport({
        urlLat: null,
        urlLng: null,
        urlZoom: null,
        initialCenter: null,
        isMobile: true,
        userInteracted: false
      })
      
      expect(result.source).toBe('geo')
      expect(result.center).toBeNull()
    })

    it('should use IP fallback when no URL/persisted and not mobile', () => {
      const result = resolveInitialViewport({
        urlLat: null,
        urlLng: null,
        urlZoom: null,
        initialCenter: { lat: 39.8283, lng: -98.5795 },
        isMobile: false,
        userInteracted: false
      })
      
      expect(result.source).toBe('ip')
      expect(result.center).toEqual({ lat: 39.8283, lng: -98.5795 })
    })

    it('should not signal geolocation if user has interacted', () => {
      const result = resolveInitialViewport({
        urlLat: null,
        urlLng: null,
        urlZoom: null,
        initialCenter: null,
        isMobile: true,
        userInteracted: true
      })
      
      // Should fall back to IP or fallback, not geo
      expect(result.source).not.toBe('geo')
    })
  })

  describe('Invalid input handling', () => {
    it('should handle invalid URL params gracefully', () => {
      const result = resolveInitialViewport({
        urlLat: 'invalid',
        urlLng: '-85.7585',
        urlZoom: '12',
        initialCenter: { lat: 40.0, lng: -90.0 },
        isMobile: false,
        userInteracted: false
      })
      
      // Should fall back to next source
      expect(result.source).not.toBe('url')
    })

    it('should handle out-of-range coordinates', () => {
      const result = resolveInitialViewport({
        urlLat: '100', // Invalid latitude
        urlLng: '-85.7585',
        urlZoom: '12',
        initialCenter: { lat: 40.0, lng: -90.0 },
        isMobile: false,
        userInteracted: false
      })
      
      expect(result.source).not.toBe('url')
    })
  })
})

describe('Viewport Persistence', () => {
  it('should save and load viewport state', () => {
    const viewport = { lat: 38.2527, lng: -85.7585, zoom: 12 }
    const filters = { dateRange: 'any', categories: ['furniture'], radius: 25 }
    
    saveViewportState(viewport, filters)
    
    const loaded = loadViewportState()
    expect(loaded).not.toBeNull()
    expect(loaded?.viewport).toEqual(viewport)
    expect(loaded?.filters).toEqual(filters)
  })

  it('should return null for stale state', () => {
    const viewport = { lat: 38.2527, lng: -85.7585, zoom: 12 }
    const filters = { dateRange: 'any', categories: [], radius: 10 }
    
    // Save with old timestamp (31 days ago)
    const oldState = {
      viewport,
      filters,
      version: '1.0.0',
      timestamp: Date.now() - (31 * 24 * 60 * 60 * 1000)
    }
    
    localStorage.setItem('yard-sale-map-state', JSON.stringify(oldState))
    
    const loaded = loadViewportState()
    expect(loaded).toBeNull()
  })

  it('should handle version mismatch', () => {
    const oldState = {
      viewport: { lat: 38.2527, lng: -85.7585, zoom: 12 },
      filters: { dateRange: 'any', categories: [], radius: 10 },
      version: '0.9.0', // Old version
      timestamp: Date.now()
    }
    
    localStorage.setItem('yard-sale-map-state', JSON.stringify(oldState))
    
    const loaded = loadViewportState()
    expect(loaded).toBeNull()
    // State should be cleared
    expect(localStorage.getItem('yard-sale-map-state')).toBeNull()
  })
})

describe('Geolocation utilities', () => {
  describe('Denial tracking', () => {
    it('should track geolocation denial', () => {
      expect(isGeolocationDenied()).toBe(false)
      
      setGeolocationDenied()
      
      expect(isGeolocationDenied()).toBe(true)
    })

    it('should clear denial state', () => {
      setGeolocationDenied()
      expect(isGeolocationDenied()).toBe(true)
      
      clearGeolocationDenial()
      expect(isGeolocationDenied()).toBe(false)
    })
  })

  describe('Geolocation API', () => {
    it('should check if geolocation is available', () => {
      // Should be available since we mocked it
      expect(isGeolocationAvailable()).toBe(true)
    })

    it('should request geolocation successfully', async () => {
      const mockPosition = {
        coords: {
          latitude: 38.2527,
          longitude: -85.7585,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      }
      
      mockGeolocation.getCurrentPosition.mockImplementation((success, _error, _options) => {
        // Call success callback - Promise wrapper handles async correctly
        success(mockPosition as any)
      })
      
      const location = await requestGeolocation()
      
      expect(location.lat).toBe(38.2527)
      expect(location.lng).toBe(-85.7585)
      expect(location.accuracy).toBe(10)
    })

    it('should handle permission denied error', async () => {
      const mockError = {
        code: 1, // PERMISSION_DENIED
        message: 'User denied geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      }
      
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        // Call error callback - Promise wrapper handles async correctly
        if (error) {
          error(mockError as any)
        }
      })
      
      await expect(requestGeolocation()).rejects.toMatchObject({
        code: 1,
        message: 'User denied geolocation'
      })
      
      // Should track denial
      expect(isGeolocationDenied()).toBe(true)
    })

    it('should handle timeout error', async () => {
      const mockError = {
        code: 3, // TIMEOUT
        message: 'Geolocation request timed out',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      }
      
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        // Call error callback - Promise wrapper handles async correctly
        if (error) {
          error(mockError as any)
        }
      })
      
      await expect(requestGeolocation()).rejects.toMatchObject({
        code: 3,
        message: 'Geolocation request timed out'
      })
      
      // Should not track denial for timeout
      expect(isGeolocationDenied()).toBe(false)
    })
  })
})
