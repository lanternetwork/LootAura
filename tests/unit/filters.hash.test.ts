/**
 * Unit tests for filter hashing functionality
 */

import { describe, it, expect } from 'vitest'
import { hashFilters, filtersEqual, createCacheKey, type FilterState } from '@/lib/filters/hash'

describe('Filter Hashing', () => {
  const baseFilters: FilterState = {
    dateRange: 'any',
    categories: ['furniture', 'tools'],
    radius: 25
  }

  it('should generate consistent hash for same filters', () => {
    const hash1 = hashFilters(baseFilters)
    const hash2 = hashFilters(baseFilters)
    
    expect(hash1).toBe(hash2)
    expect(hash1).toBeTruthy()
  })

  it('should generate different hash for different filters', () => {
    const filters1 = { ...baseFilters, radius: 25 }
    const filters2 = { ...baseFilters, radius: 50 }
    
    const hash1 = hashFilters(filters1)
    const hash2 = hashFilters(filters2)
    
    expect(hash1).not.toBe(hash2)
  })

  it('should handle reordered categories consistently', () => {
    const filters1 = {
      ...baseFilters,
      categories: ['furniture', 'tools']
    }
    const filters2 = {
      ...baseFilters,
      categories: ['tools', 'furniture']
    }
    
    const hash1 = hashFilters(filters1)
    const hash2 = hashFilters(filters2)
    
    expect(hash1).toBe(hash2)
  })

  it('should handle empty categories array', () => {
    const filters = {
      ...baseFilters,
      categories: []
    }
    
    const hash = hashFilters(filters)
    expect(hash).toBeTruthy()
  })

  it('should handle different date ranges', () => {
    const filters1 = { ...baseFilters, dateRange: 'today' }
    const filters2 = { ...baseFilters, dateRange: 'this_weekend' }
    
    const hash1 = hashFilters(filters1)
    const hash2 = hashFilters(filters2)
    
    expect(hash1).not.toBe(hash2)
  })

  it('should handle different radius values', () => {
    const filters1 = { ...baseFilters, radius: 10 }
    const filters2 = { ...baseFilters, radius: 25 }
    const filters3 = { ...baseFilters, radius: 50 }
    
    const hash1 = hashFilters(filters1)
    const hash2 = hashFilters(filters2)
    const hash3 = hashFilters(filters3)
    
    expect(hash1).not.toBe(hash2)
    expect(hash2).not.toBe(hash3)
    expect(hash1).not.toBe(hash3)
  })

  it('should correctly identify equal filters', () => {
    const filters1 = {
      dateRange: 'any',
      categories: ['furniture', 'tools'],
      radius: 25
    }
    const filters2 = {
      dateRange: 'any',
      categories: ['tools', 'furniture'], // Reordered
      radius: 25
    }
    
    expect(filtersEqual(filters1, filters2)).toBe(true)
  })

  it('should correctly identify different filters', () => {
    const filters1 = {
      dateRange: 'any',
      categories: ['furniture'],
      radius: 25
    }
    const filters2 = {
      dateRange: 'any',
      categories: ['furniture', 'tools'],
      radius: 25
    }
    
    expect(filtersEqual(filters1, filters2)).toBe(false)
  })

  it('should create cache key from tile ID and filter hash', () => {
    const tileId = 'zoom-10-lat-5-lng-3'
    const filterHash = 'abc123'
    
    const cacheKey = createCacheKey(tileId, filterHash)
    
    expect(cacheKey).toBe('zoom-10-lat-5-lng-3:abc123')
  })

  it('should handle special characters in tile ID', () => {
    const tileId = 'zoom-10-lat-5-lng-3:special'
    const filterHash = 'def456'
    
    const cacheKey = createCacheKey(tileId, filterHash)
    
    expect(cacheKey).toBe('zoom-10-lat-5-lng-3:special:def456')
  })

  it('should generate stable hash for complex filter combinations', () => {
    const complexFilters = {
      dateRange: 'this_weekend',
      categories: ['furniture', 'tools', 'electronics', 'books'],
      radius: 50
    }
    
    const hash1 = hashFilters(complexFilters)
    const hash2 = hashFilters(complexFilters)
    
    expect(hash1).toBe(hash2)
    expect(hash1.length).toBeGreaterThan(0)
  })
})
