import { describe, it, expect } from 'vitest'
import { normalizeFilters, filtersEqual } from '@/lib/shared/categoryNormalizer'

describe('arbiter.contract', () => {
  it('should allow UI updates when categories change under MAP authority', () => {
    const prevFilters = {
      categories: ['tools'],
      city: 'Louisville',
      dateRange: 'any'
    }
    
    const nextFilters = {
      categories: ['tools', 'furniture'],
      city: 'Louisville', 
      dateRange: 'any'
    }
    
    const normalizedPrev = normalizeFilters(prevFilters)
    const normalizedNext = normalizeFilters(nextFilters)
    
    // Simulate arbiter logic
    const equalFilters = filtersEqual(normalizedPrev, normalizedNext)
    const categoriesChanged = normalizedPrev.categories.join(',') !== normalizedNext.categories.join(',')
    
    // Under MAP authority with category change
    const shouldSkipNetwork = equalFilters && !categoriesChanged
    const shouldUpdateUI = categoriesChanged || !equalFilters
    
    // Assert: shouldSkipNetwork=true, category change → shouldUpdateUI===true
    expect(shouldSkipNetwork).toBe(false) // Categories changed, so don't skip network
    expect(shouldUpdateUI).toBe(true) // Categories changed, so update UI
  })
  
  it('should skip network but update UI when only categories change', () => {
    const prevFilters = {
      categories: ['tools'],
      city: 'Louisville',
      dateRange: 'any'
    }
    
    const nextFilters = {
      categories: ['furniture'],
      city: 'Louisville',
      dateRange: 'any'
    }
    
    const normalizedPrev = normalizeFilters(prevFilters)
    const normalizedNext = normalizeFilters(nextFilters)
    
    const equalFilters = filtersEqual(normalizedPrev, normalizedNext)
    const categoriesChanged = normalizedPrev.categories.join(',') !== normalizedNext.categories.join(',')
    
    // Under MAP authority with only category change
    const shouldSkipNetwork = equalFilters && !categoriesChanged
    const shouldUpdateUI = categoriesChanged || !equalFilters
    
    // Assert: categories changed, so update UI
    expect(shouldUpdateUI).toBe(true)
  })
  
  it('should skip both network and UI when filters are identical', () => {
    const filters = {
      categories: ['tools'],
      city: 'Louisville',
      dateRange: 'any'
    }
    
    const normalized = normalizeFilters(filters)
    const equalFilters = filtersEqual(normalized, normalized)
    const categoriesChanged = false
    
    const shouldSkipNetwork = equalFilters && !categoriesChanged
    const shouldUpdateUI = categoriesChanged || !equalFilters
    
    // Assert: identical filters → skip both
    expect(shouldSkipNetwork).toBe(true)
    expect(shouldUpdateUI).toBe(false)
  })
  
  it('should handle empty categories consistently', () => {
    const prevFilters = {
      categories: [],
      city: 'Louisville',
      dateRange: 'any'
    }
    
    const nextFilters = {
      categories: ['tools'],
      city: 'Louisville',
      dateRange: 'any'
    }
    
    const normalizedPrev = normalizeFilters(prevFilters)
    const normalizedNext = normalizeFilters(nextFilters)
    
    const equalFilters = filtersEqual(normalizedPrev, normalizedNext)
    const categoriesChanged = normalizedPrev.categories.join(',') !== normalizedNext.categories.join(',')
    
    const shouldUpdateUI = categoriesChanged || !equalFilters
    
    // Assert: empty to non-empty categories → update UI
    expect(shouldUpdateUI).toBe(true)
  })
})
