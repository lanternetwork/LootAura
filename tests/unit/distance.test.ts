import { describe, it, expect } from 'vitest'
import { haversineKm, kmToMiles, milesToKm } from '@/lib/distance'

describe('Distance calculations', () => {
  describe('haversineKm', () => {
    it('returns 0 for same point', () => {
      const point = { lat: 0, lng: 0 }
      expect(haversineKm(point, point)).toBeCloseTo(0, 5)
    })

    it('calculates distance between two points correctly', () => {
      // Distance between New York and Los Angeles (approximately 3936 km)
      const nyc = { lat: 40.7128, lng: -74.0060 }
      const la = { lat: 34.0522, lng: -118.2437 }
      const distance = haversineKm(nyc, la)
      expect(distance).toBeCloseTo(3936, -1)
    })

    it('calculates distance between close points', () => {
      // Distance between two points in San Francisco (approximately 1 km)
      const point1 = { lat: 37.7749, lng: -122.4194 }
      const point2 = { lat: 37.7849, lng: -122.4094 }
      const distance = haversineKm(point1, point2)
      expect(distance).toBeCloseTo(1.4, 0)
    })

    it('handles negative coordinates', () => {
      const point1 = { lat: -33.9249, lng: 18.4241 } // Cape Town
      const point2 = { lat: -26.2041, lng: 28.0473 } // Johannesburg
      const distance = haversineKm(point1, point2)
      expect(distance).toBeCloseTo(1262, -1)
    })
  })

  describe('kmToMiles', () => {
    it('converts kilometers to miles correctly', () => {
      expect(kmToMiles(1)).toBeCloseTo(0.621371, 5)
      expect(kmToMiles(10)).toBeCloseTo(6.21371, 5)
      expect(kmToMiles(100)).toBeCloseTo(62.1371, 5)
    })

    it('handles zero', () => {
      expect(kmToMiles(0)).toBe(0)
    })
  })

  describe('milesToKm', () => {
    it('converts miles to kilometers correctly', () => {
      expect(milesToKm(1)).toBeCloseTo(1.60934, 5)
      expect(milesToKm(10)).toBeCloseTo(16.0934, 5)
      expect(milesToKm(100)).toBeCloseTo(160.934, 5)
    })

    it('handles zero', () => {
      expect(milesToKm(0)).toBe(0)
    })
  })

  describe('round-trip conversion', () => {
    it('maintains accuracy in round-trip conversions', () => {
      const originalKm = 100
      const miles = kmToMiles(originalKm)
      const backToKm = milesToKm(miles)
      expect(backToKm).toBeCloseTo(originalKm, 0)
    })
  })
})
