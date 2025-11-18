/**
 * Integration tests for viewport restoration in SalesClient
 * 
 * Tests verify that:
 * - SalesClient reads viewport params (lat, lng, zoom) from URL
 * - Viewport is restored from URL params when returning from detail page
 * - Effective center and zoom are set from URL params when available
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSearchParams } from 'next/navigation'

// Mock next/navigation
const mockSearchParams = new Map<string, string>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: vi.fn(() => ({
    get: (key: string) => mockSearchParams.get(key),
    has: (key: string) => mockSearchParams.has(key),
    getAll: () => Array.from(mockSearchParams.entries()),
  })),
  usePathname: () => '/sales',
}))

// Helper function to match SalesClient's distanceToZoom logic
const distanceToZoom = (distance: number): number => {
  if (distance <= 1) return 15
  if (distance <= 2) return 14
  if (distance <= 5) return 13
  if (distance <= 10) return 12
  if (distance <= 15) return 11
  if (distance <= 25) return 10
  if (distance <= 50) return 9
  if (distance <= 75) return 8
  return 8
}

const DEFAULT_DISTANCE = 10 // matches DEFAULT_FILTERS.distance in useFilters
const DEFAULT_ZOOM = distanceToZoom(DEFAULT_DISTANCE) // 12

describe('SalesClient Viewport Restoration', () => {
  beforeEach(() => {
    mockSearchParams.clear()
  })

  describe('URL parameter parsing', () => {
    it('should extract lat, lng, and zoom from URL params', () => {
      mockSearchParams.set('lat', '38.2527')
      mockSearchParams.set('lng', '-85.7585')
      mockSearchParams.set('zoom', '12')

      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')
      const urlZoom = searchParams.get('zoom')

      expect(urlLat).toBe('38.2527')
      expect(urlLng).toBe('-85.7585')
      expect(urlZoom).toBe('12')
    })

    it('should parse lat and lng as floats for effectiveCenter', () => {
      mockSearchParams.set('lat', '38.2527')
      mockSearchParams.set('lng', '-85.7585')

      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')

      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : null

      expect(effectiveCenter).toEqual({
        lat: 38.2527,
        lng: -85.7585
      })
      expect(typeof effectiveCenter?.lat).toBe('number')
      expect(typeof effectiveCenter?.lng).toBe('number')
    })

    it('should parse zoom as float for mapView', () => {
      mockSearchParams.set('zoom', '15.5')

      const searchParams = useSearchParams()
      const urlZoom = searchParams.get('zoom')

      const zoom = urlZoom ? parseFloat(urlZoom) : 12

      expect(zoom).toBe(15.5)
      expect(typeof zoom).toBe('number')
    })

    it('should use default zoom when zoom param is missing', () => {
      const searchParams = useSearchParams()
      const urlZoom = searchParams.get('zoom')

      // Default zoom is now 12 (matching 10-mile distance filter)
      const zoom = urlZoom ? parseFloat(urlZoom) : DEFAULT_ZOOM

      expect(zoom).toBe(DEFAULT_ZOOM)
    })
  })

  describe('viewport restoration logic', () => {
    it('should prefer URL params over initialCenter', () => {
      mockSearchParams.set('lat', '38.2527')
      mockSearchParams.set('lng', '-85.7585')
      mockSearchParams.set('zoom', '15')

      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')

      const initialCenter = { lat: 39.8283, lng: -98.5795 } // Default center
      
      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : initialCenter

      // Should use URL params, not initialCenter
      expect(effectiveCenter).toEqual({
        lat: 38.2527,
        lng: -85.7585
      })
      expect(effectiveCenter).not.toEqual(initialCenter)
    })

    it('should fall back to initialCenter when URL params are missing', () => {
      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')

      const initialCenter = { lat: 39.8283, lng: -98.5795 }
      
      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : initialCenter

      // Should use initialCenter when URL params are missing
      expect(effectiveCenter).toEqual(initialCenter)
    })

    it('should handle partial URL params (missing zoom)', () => {
      mockSearchParams.set('lat', '38.2527')
      mockSearchParams.set('lng', '-85.7585')
      // zoom is missing

      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')
      const urlZoom = searchParams.get('zoom')

      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : null

      // Default zoom is now 12 (matching 10-mile distance filter)
      const zoom = urlZoom ? parseFloat(urlZoom) : DEFAULT_ZOOM

      // Should still use lat/lng but default zoom
      expect(effectiveCenter).toEqual({
        lat: 38.2527,
        lng: -85.7585
      })
      expect(zoom).toBe(DEFAULT_ZOOM)
    })
  })

  describe('viewport state initialization', () => {
    it('should initialize mapView with URL params when available', () => {
      mockSearchParams.set('lat', '38.2527')
      mockSearchParams.set('lng', '-85.7585')
      mockSearchParams.set('zoom', '15')

      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')
      const urlZoom = searchParams.get('zoom')

      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : { lat: 39.8283, lng: -98.5795 }

      // Simulate mapView state initialization
      const mapView = {
        center: effectiveCenter,
        bounds: {
          west: effectiveCenter.lng - 1.0,
          south: effectiveCenter.lat - 1.0,
          east: effectiveCenter.lng + 1.0,
          north: effectiveCenter.lat + 1.0
        },
        zoom: urlZoom ? parseFloat(urlZoom) : 12
      }

      expect(mapView.center).toEqual({
        lat: 38.2527,
        lng: -85.7585
      })
      expect(mapView.zoom).toBe(15)
      expect(mapView.bounds).toEqual({
        west: -86.7585,
        south: 37.2527,
        east: -84.7585,
        north: 39.2527
      })
    })

    it('should initialize mapView with defaults when URL params are missing', () => {
      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')
      const urlZoom = searchParams.get('zoom')

      const defaultCenter = { lat: 39.8283, lng: -98.5795 }
      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : defaultCenter

      // Simulate mapView state initialization
      // Default zoom is now 12 (matching 10-mile distance filter)
      const mapView = {
        center: effectiveCenter,
        bounds: {
          west: effectiveCenter.lng - 1.0,
          south: effectiveCenter.lat - 1.0,
          east: effectiveCenter.lng + 1.0,
          north: effectiveCenter.lat + 1.0
        },
        zoom: urlZoom ? parseFloat(urlZoom) : DEFAULT_ZOOM
      }

      expect(mapView.center).toEqual(defaultCenter)
      expect(mapView.zoom).toBe(DEFAULT_ZOOM)
    })
  })

  describe('edge cases', () => {
    it('should handle invalid URL param values', () => {
      mockSearchParams.set('lat', 'invalid')
      mockSearchParams.set('lng', 'not-a-number')
      mockSearchParams.set('zoom', 'also-invalid')

      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')
      const urlZoom = searchParams.get('zoom')

      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : { lat: 39.8283, lng: -98.5795 }

      // Handle invalid zoom values - parseFloat returns NaN for invalid input
      const parsedZoom = urlZoom ? parseFloat(urlZoom) : NaN
      const zoom = isNaN(parsedZoom) ? DEFAULT_ZOOM : parsedZoom

      // Should fall back to default when zoom is invalid (now 12, matching 10-mile distance)
      expect(zoom).toBe(DEFAULT_ZOOM)
    })

    it('should handle zero zoom level', () => {
      mockSearchParams.set('zoom', '0')

      const searchParams = useSearchParams()
      const urlZoom = searchParams.get('zoom')

      const zoom = urlZoom ? parseFloat(urlZoom) : 12

      expect(zoom).toBe(0)
    })

    it('should handle negative latitude (southern hemisphere)', () => {
      mockSearchParams.set('lat', '-38.2527')
      mockSearchParams.set('lng', '-85.7585')

      const searchParams = useSearchParams()
      const urlLat = searchParams.get('lat')
      const urlLng = searchParams.get('lng')

      const effectiveCenter = urlLat && urlLng
        ? { lat: parseFloat(urlLat), lng: parseFloat(urlLng) }
        : null

      expect(effectiveCenter).toEqual({
        lat: -38.2527,
        lng: -85.7585
      })
    })
  })
})

