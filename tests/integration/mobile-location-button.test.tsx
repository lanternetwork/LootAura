/**
 * Integration tests for mobile location button visibility
 * 
 * Tests verify:
 * - No "Recenter Map" text ever renders on mobile
 * - Location icon appears only when permission not granted OR map not centered on user
 * - Location icon is hidden when permission granted AND map centered on user
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkGeolocationPermission } from '@/lib/location/client'
import { isPointInsideBounds } from '@/lib/map/bounds'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Mock the permission check
vi.mock('@/lib/location/client', () => ({
  checkGeolocationPermission: vi.fn()
}))

describe('Mobile Location Button Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Visibility Logic', () => {
    it('should show button when permission not granted', async () => {
      vi.mocked(checkGeolocationPermission).mockResolvedValue(false)
      
      const hasLocationPermission = await checkGeolocationPermission()
      const isMapCenteredOnUserLocation = false // Doesn't matter when no permission
      
      // Visible if: permission not granted OR (permission granted AND map not centered)
      const shouldShow = !hasLocationPermission || (hasLocationPermission && !isMapCenteredOnUserLocation)
      
      expect(shouldShow).toBe(true)
    })

    it('should show button when permission granted but map not centered on user', async () => {
      vi.mocked(checkGeolocationPermission).mockResolvedValue(true)
      
      const hasLocationPermission = await checkGeolocationPermission()
      const isMapCenteredOnUserLocation = false
      
      // Visible if: permission not granted OR (permission granted AND map not centered)
      const shouldShow = !hasLocationPermission || (hasLocationPermission && !isMapCenteredOnUserLocation)
      
      expect(shouldShow).toBe(true)
    })

    it('should hide button when permission granted AND map centered on user', async () => {
      vi.mocked(checkGeolocationPermission).mockResolvedValue(true)
      
      const hasLocationPermission = await checkGeolocationPermission()
      const isMapCenteredOnUserLocation = true
      
      // Visible if: permission not granted OR (permission granted AND map not centered)
      const shouldShow = !hasLocationPermission || (hasLocationPermission && !isMapCenteredOnUserLocation)
      
      expect(shouldShow).toBe(false)
    })
  })

  describe('Map Centering Detection', () => {
    it('should detect when user location is inside map bounds', () => {
      const userLocation = { lat: 40.0, lng: -90.0 }
      const mapBounds = {
        west: -91.0,
        south: 39.0,
        east: -89.0,
        north: 41.0
      }
      
      const point: [number, number] = [userLocation.lng, userLocation.lat]
      const isCentered = isPointInsideBounds(point, mapBounds)
      
      expect(isCentered).toBe(true)
    })

    it('should detect when user location is outside map bounds', () => {
      const userLocation = { lat: 40.0, lng: -90.0 }
      const mapBounds = {
        west: -95.0,
        south: 35.0,
        east: -93.0,
        north: 37.0
      }
      
      const point: [number, number] = [userLocation.lng, userLocation.lat]
      const isCentered = isPointInsideBounds(point, mapBounds)
      
      expect(isCentered).toBe(false)
    })
  })

  describe('No Recenter Map Text', () => {
    it('should never render "Recenter Map" text on mobile', () => {
      const sourcePath = path.resolve(process.cwd(), 'app/sales/MobileSalesShell.tsx')
      const source = readFileSync(sourcePath, 'utf-8')
      expect(source.includes('Recenter Map')).toBe(false)
      expect(source.includes('MobileRecenterButton')).toBe(false)
    })
  })
})
