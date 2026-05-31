import { describe, it, expect } from 'vitest'
import {
  clampSalesDistanceKm,
  parseBboxSalesDistanceKm,
  parseSalesRadiusKmFromParams,
  SALES_MAX_DISTANCE_KM,
} from '@/lib/sales/parseSalesDistanceKm'

describe('parseSalesDistanceKm', () => {
  describe('parseSalesRadiusKmFromParams', () => {
    it('returns clamped radiusKm when provided', () => {
      const params = new URLSearchParams({ radiusKm: '16.0934' })
      expect(parseSalesRadiusKmFromParams(params)).toBeCloseTo(16.0934, 4)
    })

    it('clamps radiusKm to max', () => {
      const params = new URLSearchParams({ radiusKm: '999' })
      expect(parseSalesRadiusKmFromParams(params)).toBe(SALES_MAX_DISTANCE_KM)
    })

    it('returns undefined when radiusKm absent', () => {
      expect(parseSalesRadiusKmFromParams(new URLSearchParams())).toBeUndefined()
    })

    it('returns undefined for invalid radiusKm', () => {
      expect(parseSalesRadiusKmFromParams(new URLSearchParams({ radiusKm: 'abc' }))).toBeUndefined()
      expect(parseSalesRadiusKmFromParams(new URLSearchParams({ radiusKm: '0' }))).toBeUndefined()
    })
  })

  describe('parseBboxSalesDistanceKm', () => {
    it('prefers radiusKm over deprecated dist', () => {
      const params = new URLSearchParams({ radiusKm: '16.09', dist: '80' })
      expect(parseBboxSalesDistanceKm(params)).toBe(16.09)
    })

    it('falls back to deprecated dist when radiusKm absent', () => {
      const deprecated: Array<'dist' | 'distance'> = []
      const params = new URLSearchParams({ dist: '25' })
      expect(parseBboxSalesDistanceKm(params, (p) => deprecated.push(p))).toBe(25)
      expect(deprecated).toEqual(['dist'])
    })

    it('does not use hidden 1000km fallback when params absent', () => {
      expect(parseBboxSalesDistanceKm(new URLSearchParams())).toBeUndefined()
    })
  })

  describe('clampSalesDistanceKm', () => {
    it('enforces minimum 1 km', () => {
      expect(clampSalesDistanceKm(0.2)).toBe(1)
    })
  })
})
