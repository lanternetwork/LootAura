/**
 * Unit tests for URL state management
 */

import { describe, it, expect } from 'vitest'
import { 
  serializeState, 
  deserializeState, 
  compressState, 
  decompressState,
  hasStateChanged,
  getDefaultState,
  type AppState 
} from '@/lib/url/state'

describe('URL State Management', () => {
  const defaultState: AppState = {
    view: { lat: 38.2527, lng: -85.7585, zoom: 10 },
    filters: { dateRange: 'any', categories: [], radius: 25 }
  }

  const customState: AppState = {
    view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
    filters: { dateRange: 'today', categories: ['electronics', 'furniture'], radius: 50 }
  }

  describe('serializeState', () => {
    it('should serialize default state with minimal params', () => {
      const result = serializeState(defaultState)
      expect(result).toBe('lat=38.2527&lng=-85.7585&zoom=10')
    })

    it('should serialize custom state with all params', () => {
      const result = serializeState(customState)
      expect(result).toContain('lat=40.7128')
      expect(result).toContain('lng=-74.006')
      expect(result).toContain('zoom=12')
      expect(result).toContain('date=today')
      expect(result).toContain('cats=electronics%2Cfurniture') // sorted
      expect(result).toContain('radius=50')
    })

    it('should sort categories for consistent URLs', () => {
      const stateWithUnsortedCategories: AppState = {
        view: { lat: 40.7128, lng: -74.0060, zoom: 12 },
        filters: { dateRange: 'any', categories: ['zebra', 'apple', 'banana'], radius: 25 }
      }
      
      const result = serializeState(stateWithUnsortedCategories)
      expect(result).toContain('cats=apple%2Cbanana%2Czebra')
    })
  })

  describe('deserializeState', () => {
    it('should deserialize minimal URL to default state', () => {
      const result = deserializeState('lat=38.2527&lng=-85.7585&zoom=10')
      expect(result).toEqual(defaultState)
    })

    it('should deserialize full URL with all params', () => {
      const result = deserializeState('lat=40.7128&lng=-74.006&zoom=12&date=today&cats=electronics%2Cfurniture&radius=50')
      expect(result).toEqual(customState)
    })

    it('should handle missing params with defaults', () => {
      const result = deserializeState('lat=40.7128&lng=-74.006')
      expect(result.view).toEqual({ lat: 40.7128, lng: -74.0060, zoom: 10 })
      expect(result.filters).toEqual({ dateRange: 'any', categories: [], radius: 25 })
    })

    it('should ignore unknown parameters', () => {
      const result = deserializeState('lat=40.7128&lng=-74.006&unknown=value&other=123')
      expect(result.view).toEqual({ lat: 40.7128, lng: -74.0060, zoom: 10 })
    })

    it('should handle empty search string', () => {
      const result = deserializeState('')
      expect(result).toEqual(defaultState)
    })
  })

  describe('round-trip serialization', () => {
    it('should preserve state through serialize/deserialize', () => {
      const serialized = serializeState(customState)
      const deserialized = deserializeState(serialized)
      expect(deserialized).toEqual(customState)
    })

    it('should preserve default state through serialize/deserialize', () => {
      const serialized = serializeState(defaultState)
      const deserialized = deserializeState(serialized)
      expect(deserialized).toEqual(defaultState)
    })
  })

  describe('compressState', () => {
    it('should compress and decompress state correctly', () => {
      const compressed = compressState(customState)
      const decompressed = decompressState(compressed)
      expect(decompressed).toEqual(customState)
    })

    it('should produce shorter strings for complex states', () => {
      const serialized = serializeState(customState)
      const compressed = compressState(customState)
      expect(compressed.length).toBeLessThan(serialized.length)
    })
  })

  describe('hasStateChanged', () => {
    it('should return false for identical states', () => {
      expect(hasStateChanged(defaultState, defaultState)).toBe(false)
    })

    it('should return true for different states', () => {
      expect(hasStateChanged(defaultState, customState)).toBe(true)
    })

    it('should detect viewport changes', () => {
      const modifiedState = { ...defaultState, view: { ...defaultState.view, zoom: 15 } }
      expect(hasStateChanged(defaultState, modifiedState)).toBe(true)
    })

    it('should detect filter changes', () => {
      const modifiedState = { ...defaultState, filters: { ...defaultState.filters, radius: 50 } }
      expect(hasStateChanged(defaultState, modifiedState)).toBe(true)
    })
  })

  describe('getDefaultState', () => {
    it('should return default state', () => {
      const result = getDefaultState()
      expect(result).toEqual(defaultState)
    })
  })
})


