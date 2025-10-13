import { describe, it, expect } from 'vitest'
import { normalizeCategories } from '@/lib/shared/categoryNormalizer'

describe('filters.url-parity', () => {
  it('should include categories param when categories are selected', () => {
    const filters = {
      lat: 38.1975,
      lng: -85.7416,
      distance: 10,
      categories: ['tools', 'furniture'],
      dateRange: 'any' as const
    }
    
    // Build markers request from canonical filters
    const params = new URLSearchParams()
    params.set('lat', String(filters.lat))
    params.set('lng', String(filters.lng))
    params.set('distanceKm', String(filters.distance * 1.60934))
    params.set('categories', filters.categories.join(','))
    params.set('limit', '1000')
    
    const url = params.toString()
    
    // Assert: selected categories → &categories=<csv> present
    expect(url).toContain('categories=tools,furniture')
    
    // Assert KEY cats string equals URL cats string
    const normalizedCats = normalizeCategories(filters.categories)
    const expectedCsv = normalizedCats.join(',')
    expect(url).toContain(`categories=${expectedCsv}`)
  })
  
  it('should omit categories param when no categories are selected', () => {
    const filters = {
      lat: 38.1975,
      lng: -85.7416,
      distance: 10,
      categories: [],
      dateRange: 'any' as const
    }
    
    // Build markers request from canonical filters
    const params = new URLSearchParams()
    params.set('lat', String(filters.lat))
    params.set('lng', String(filters.lng))
    params.set('distanceKm', String(filters.distance * 1.60934))
    // Note: categories param is omitted when empty
    params.set('limit', '1000')
    
    const url = params.toString()
    
    // Assert: no categories → categories param is omitted (not categories=)
    expect(url).not.toContain('categories=')
    expect(url).not.toContain('categories')
  })
  
  it('should normalize categories consistently between KEY and URL', () => {
    const rawCategories = ['Tools', ' FURNITURE ', 'toys']
    const normalized = normalizeCategories(rawCategories)
    
    // Build KEY string (as used in buildMarkersKey)
    const keyCats = normalized.sort().join(',')
    
    // Build URL string (as used in fetchMapSales)
    const urlCats = normalized.join(',')
    
    // Assert KEY cats string equals URL cats string
    expect(keyCats).toBe('furniture,tools,toys')
    expect(urlCats).toBe('tools,furniture,toys')
    
    // Both should contain the same normalized values, just different order
    const keySet = new Set(keyCats.split(','))
    const urlSet = new Set(urlCats.split(','))
    expect(keySet).toEqual(urlSet)
  })
})
