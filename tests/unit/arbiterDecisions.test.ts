import { describe, it, expect } from 'vitest'
import { 
  createCategoriesKey, 
  categoriesEqual, 
  normalizeCategories,
  filtersEqual 
} from '@/lib/shared/categoryNormalizer'

describe('Arbiter Decisions', () => {
  describe('Category Key Creation', () => {
    it('should create consistent keys for same categories', () => {
      const cats1 = ['furniture', 'tools']
      const cats2 = ['tools', 'furniture']
      const cats3 = ['furniture', 'tools', 'furniture']
      
      const key1 = createCategoriesKey(cats1)
      const key2 = createCategoriesKey(cats2)
      const key3 = createCategoriesKey(cats3)
      
      expect(key1).toBe('furniture,tools')
      expect(key1).toBe(key2)
      expect(key1).toBe(key3)
    })

    it('should create different keys for different categories', () => {
      const cats1 = ['furniture']
      const cats2 = ['tools']
      const cats3 = ['furniture', 'tools']
      
      const key1 = createCategoriesKey(cats1)
      const key2 = createCategoriesKey(cats2)
      const key3 = createCategoriesKey(cats3)
      
      expect(key1).toBe('furniture')
      expect(key2).toBe('tools')
      expect(key3).toBe('furniture,tools')
      
      expect(key1).not.toBe(key2)
      expect(key1).not.toBe(key3)
      expect(key2).not.toBe(key3)
    })

    it('should handle empty arrays', () => {
      expect(createCategoriesKey([])).toBe('')
      expect(createCategoriesKey([''])).toBe('')
    })
  })

  describe('Category Equality', () => {
    it('should detect equal categories regardless of order', () => {
      expect(categoriesEqual(['furniture', 'tools'], ['tools', 'furniture'])).toBe(true)
      expect(categoriesEqual(['furniture'], ['furniture'])).toBe(true)
      expect(categoriesEqual([], [])).toBe(true)
    })

    it('should detect different categories', () => {
      expect(categoriesEqual(['furniture'], ['tools'])).toBe(false)
      expect(categoriesEqual(['furniture'], [])).toBe(false)
      expect(categoriesEqual(['furniture', 'tools'], ['furniture'])).toBe(false)
    })
  })

  describe('Filter Equality', () => {
    it('should detect equal filters with same categories', () => {
      const filter1 = {
        categories: ['furniture', 'tools'],
        city: 'Louisville',
        dateRange: 'today'
      }
      const filter2 = {
        categories: ['tools', 'furniture'],
        city: 'Louisville',
        dateRange: 'today'
      }
      
      expect(filtersEqual(filter1, filter2)).toBe(true)
    })

    it('should detect different filters with different categories', () => {
      const filter1 = {
        categories: ['furniture'],
        city: 'Louisville',
        dateRange: 'today'
      }
      const filter2 = {
        categories: ['tools'],
        city: 'Louisville',
        dateRange: 'today'
      }
      
      expect(filtersEqual(filter1, filter2)).toBe(false)
    })

    it('should detect different filters with different cities', () => {
      const filter1 = {
        categories: ['furniture'],
        city: 'Louisville',
        dateRange: 'today'
      }
      const filter2 = {
        categories: ['furniture'],
        city: 'Nashville',
        dateRange: 'today'
      }
      
      expect(filtersEqual(filter1, filter2)).toBe(false)
    })

    it('should handle empty categories', () => {
      const filter1 = { categories: [], city: 'Louisville' }
      const filter2 = { categories: [], city: 'Louisville' }
      const filter3 = { categories: ['furniture'], city: 'Louisville' }
      
      expect(filtersEqual(filter1, filter2)).toBe(true)
      expect(filtersEqual(filter1, filter3)).toBe(false)
    })
  })

  describe('Arbiter Decision Logic', () => {
    // Pure function that returns arbiter decision
    function evaluateArbiterDecision(
      prevFilters: any,
      nextFilters: any,
      mapAuthority: boolean,
      markersSatisfyPredicate: boolean
    ): { shouldSkipNetwork: boolean; shouldUpdateUI: boolean } {
      const categoriesChanged = createCategoriesKey(prevFilters.categories || []) !== createCategoriesKey(nextFilters.categories || [])
      const filtersAreEqual = filtersEqual(prevFilters, nextFilters)
      
      const shouldSkipNetwork = mapAuthority && markersSatisfyPredicate && !categoriesChanged
      const shouldUpdateUI = categoriesChanged || !filtersAreEqual
      
      return { shouldSkipNetwork, shouldUpdateUI }
    }

    it('should skip network when MAP authoritative and markers satisfy predicate', () => {
      const prevFilters = { categories: ['furniture'], city: 'Louisville' }
      const nextFilters = { categories: ['furniture'], city: 'Louisville' }
      
      const decision = evaluateArbiterDecision(prevFilters, nextFilters, true, true)
      
      expect(decision.shouldSkipNetwork).toBe(true)
      expect(decision.shouldUpdateUI).toBe(false)
    })

    it('should NOT skip network when categories change', () => {
      const prevFilters = { categories: ['furniture'], city: 'Louisville' }
      const nextFilters = { categories: ['tools'], city: 'Louisville' }
      
      const decision = evaluateArbiterDecision(prevFilters, nextFilters, true, true)
      
      expect(decision.shouldSkipNetwork).toBe(false)
      expect(decision.shouldUpdateUI).toBe(true)
    })

    it('should NOT skip network when markers do not satisfy predicate', () => {
      const prevFilters = { categories: ['furniture'], city: 'Louisville' }
      const nextFilters = { categories: ['furniture'], city: 'Louisville' }
      
      const decision = evaluateArbiterDecision(prevFilters, nextFilters, true, false)
      
      expect(decision.shouldSkipNetwork).toBe(false)
      expect(decision.shouldUpdateUI).toBe(false)
    })

    it('should update UI when categories change even if network is skipped', () => {
      const prevFilters = { categories: ['furniture'], city: 'Louisville' }
      const nextFilters = { categories: ['tools'], city: 'Louisville' }
      
      const decision = evaluateArbiterDecision(prevFilters, nextFilters, true, true)
      
      expect(decision.shouldSkipNetwork).toBe(false)
      expect(decision.shouldUpdateUI).toBe(true)
    })

    it('should handle reordered categories as no change', () => {
      const prevFilters = { categories: ['furniture', 'tools'], city: 'Louisville' }
      const nextFilters = { categories: ['tools', 'furniture'], city: 'Louisville' }
      
      const decision = evaluateArbiterDecision(prevFilters, nextFilters, true, true)
      
      expect(decision.shouldSkipNetwork).toBe(true)
      expect(decision.shouldUpdateUI).toBe(false)
    })
  })
})
