import { describe, it, expect } from 'vitest'
import { 
  normalizeCat, 
  toDbSet, 
  buildDbMapping, 
  getUICategories,
  hasDbMapping 
} from '@/lib/shared/categoryContract'

describe('Category Contract', () => {
  describe('normalizeCat', () => {
    it('should normalize category strings correctly', () => {
      expect(normalizeCat('Furniture')).toBe('furniture')
      expect(normalizeCat('  Tools  ')).toBe('tools')
      expect(normalizeCat('Home & Garden')).toBe('home-garden')
      expect(normalizeCat('Sports/Outdoor')).toBe('sports-outdoor')
      expect(normalizeCat('')).toBe('')
      expect(normalizeCat('   ')).toBe('')
    })

    it('should handle edge cases', () => {
      expect(normalizeCat(null as any)).toBe('')
      expect(normalizeCat(undefined as any)).toBe('')
      expect(normalizeCat('   Multiple   Spaces   ')).toBe('multiple-spaces')
    })
  })

  describe('toDbSet', () => {
    it('should return normalized UI tokens when no mapping exists', () => {
      const result = toDbSet(['furniture', 'tools'])
      expect(result).toEqual(['furniture', 'tools'])
    })

    it('should handle empty arrays', () => {
      expect(toDbSet([])).toEqual([])
      expect(toDbSet(null as any)).toEqual([])
    })

    it('should apply DB mapping when available', () => {
      // Build a test mapping
      buildDbMapping([
        { value: 'furniture', count: 10 },
        { value: 'tools', count: 5 },
        { value: 'general', count: 20 }
      ])

      const result = toDbSet(['furniture', 'tools'])
      expect(result).toEqual(['furniture', 'tools'])
    })
  })

  describe('buildDbMapping', () => {
    it('should build mapping from DB categories', () => {
      const dbCategories = [
        { value: 'furniture', count: 10 },
        { value: 'tools', count: 5 },
        { value: 'general', count: 20 },
        { value: 'electronics', count: 3 }
      ]

      buildDbMapping(dbCategories)
      
      // Should have mappings for known UI categories
      expect(hasDbMapping('furniture')).toBe(true)
      expect(hasDbMapping('tools')).toBe(true)
      expect(hasDbMapping('electronics')).toBe(true)
    })

    it('should handle empty DB categories', () => {
      buildDbMapping([])
      expect(getDbMapping()).toEqual({})
    })
  })

  describe('getUICategories', () => {
    it('should return canonical UI categories', () => {
      const categories = getUICategories()
      expect(categories).toContain('furniture')
      expect(categories).toContain('tools')
      expect(categories).toContain('toys')
      expect(categories).toContain('general')
    })
  })

  describe('hasDbMapping', () => {
    it('should return false when no mapping exists', () => {
      expect(hasDbMapping('unknown')).toBe(false)
    })

    it('should return true for mapped categories', () => {
      buildDbMapping([{ value: 'furniture', count: 10 }])
      expect(hasDbMapping('furniture')).toBe(true)
    })
  })
})
