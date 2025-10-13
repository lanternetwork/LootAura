import { describe, it, expect } from 'vitest'
import { 
  normalizeCategories, 
  serializeCategories, 
  categoriesEqual, 
  normalizeFilters, 
  filtersEqual 
} from '@/lib/shared/categoryNormalizer'

describe('Category Normalizer', () => {
  describe('normalizeCategories', () => {
    it('should parse CSV string correctly', () => {
      const result = normalizeCategories('tools,furniture,electronics')
      expect(result).toEqual(['electronics', 'furniture', 'tools'])
    })

    it('should handle array input', () => {
      const result = normalizeCategories(['tools', 'furniture', 'electronics'])
      expect(result).toEqual(['electronics', 'furniture', 'tools'])
    })

    it('should handle empty string', () => {
      const result = normalizeCategories('')
      expect(result).toEqual([])
    })

    it('should handle null/undefined', () => {
      expect(normalizeCategories(null)).toEqual([])
      expect(normalizeCategories(undefined)).toEqual([])
    })

    it('should deduplicate and sort', () => {
      const result = normalizeCategories('tools,furniture,tools,electronics,furniture')
      expect(result).toEqual(['electronics', 'furniture', 'tools'])
    })

    it('should trim whitespace', () => {
      const result = normalizeCategories(' tools , furniture , electronics ')
      expect(result).toEqual(['electronics', 'furniture', 'tools'])
    })

    it('should filter out empty strings', () => {
      const result = normalizeCategories('tools,,furniture,')
      expect(result).toEqual(['furniture', 'tools'])
    })
  })

  describe('serializeCategories', () => {
    it('should serialize array to CSV', () => {
      const result = serializeCategories(['tools', 'furniture', 'electronics'])
      expect(result).toBe('tools,furniture,electronics')
    })

    it('should handle empty array', () => {
      const result = serializeCategories([])
      expect(result).toBe('')
    })

    it('should handle null/undefined', () => {
      expect(serializeCategories(null as any)).toBe('')
      expect(serializeCategories(undefined as any)).toBe('')
    })
  })

  describe('categoriesEqual', () => {
    it('should return true for identical arrays', () => {
      const a = ['tools', 'furniture']
      const b = ['tools', 'furniture']
      expect(categoriesEqual(a, b)).toBe(true)
    })

    it('should return true for different order', () => {
      const a = ['tools', 'furniture']
      const b = ['furniture', 'tools']
      expect(categoriesEqual(a, b)).toBe(true)
    })

    it('should return false for different arrays', () => {
      const a = ['tools', 'furniture']
      const b = ['tools', 'electronics']
      expect(categoriesEqual(a, b)).toBe(false)
    })

    it('should handle empty arrays', () => {
      expect(categoriesEqual([], [])).toBe(true)
      expect(categoriesEqual(['tools'], [])).toBe(false)
    })
  })

  describe('normalizeFilters', () => {
    it('should normalize filter object', () => {
      const filters = {
        categories: 'tools,furniture',
        city: 'Louisville',
        dateRange: 'today',
        other: 'value'
      }
      
      const result = normalizeFilters(filters)
      
      expect(result.categories).toEqual(['furniture', 'tools'])
      expect(result.city).toBe('Louisville')
      expect(result.dateRange).toBe('today')
      expect(result.other).toBe('value')
    })

    it('should handle empty categories', () => {
      const filters = {
        categories: '',
        city: 'Louisville'
      }
      
      const result = normalizeFilters(filters)
      
      expect(result.categories).toEqual([])
      expect(result.city).toBe('Louisville')
    })

    it('should remove empty values', () => {
      const filters = {
        categories: [],
        city: '',
        dateRange: 'any'
      }
      
      const result = normalizeFilters(filters)
      
      expect(result.categories).toEqual([])
      expect(result.city).toBeUndefined()
      expect(result.dateRange).toBeUndefined()
    })
  })

  describe('filtersEqual', () => {
    it('should return true for identical filters', () => {
      const a = {
        categories: ['tools', 'furniture'],
        city: 'Louisville',
        dateRange: 'today'
      }
      const b = {
        categories: ['furniture', 'tools'],
        city: 'Louisville',
        dateRange: 'today'
      }
      
      expect(filtersEqual(a, b)).toBe(true)
    })

    it('should return false for different categories', () => {
      const a = {
        categories: ['tools'],
        city: 'Louisville'
      }
      const b = {
        categories: ['electronics'],
        city: 'Louisville'
      }
      
      expect(filtersEqual(a, b)).toBe(false)
    })

    it('should return false for different cities', () => {
      const a = {
        categories: ['tools'],
        city: 'Louisville'
      }
      const b = {
        categories: ['tools'],
        city: 'Nashville'
      }
      
      expect(filtersEqual(a, b)).toBe(false)
    })

    it('should handle empty filters', () => {
      const a = { categories: [] }
      const b = { categories: [] }
      
      expect(filtersEqual(a, b)).toBe(true)
    })
  })
})
