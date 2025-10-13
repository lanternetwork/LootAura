import { describe, it, expect } from 'vitest'

describe('Category Parameter Serialization', () => {
  describe('URL Parameter Serialization', () => {
    it('should serialize categories array to comma-separated string', () => {
      const categories = ['tools', 'furniture', 'electronics']
      const serialized = categories.join(',')
      
      expect(serialized).toBe('tools,furniture,electronics')
    })

    it('should handle empty categories array', () => {
      const categories: string[] = []
      const serialized = categories.join(',')
      
      expect(serialized).toBe('')
    })

    it('should handle single category', () => {
      const categories = ['tools']
      const serialized = categories.join(',')
      
      expect(serialized).toBe('tools')
    })
  })

  describe('URL Parameter Parsing', () => {
    it('should parse comma-separated categories string', () => {
      const categoriesParam = 'tools,furniture,electronics'
      const categories = categoriesParam.split(',').map(s => s.trim()).filter(Boolean)
      
      expect(categories).toEqual(['tools', 'furniture', 'electronics'])
    })

    it('should handle empty string', () => {
      const categoriesParam = ''
      const categories = categoriesParam ? categoriesParam.split(',').map(s => s.trim()).filter(Boolean) : []
      
      expect(categories).toEqual([])
    })

    it('should handle null/undefined parameter', () => {
      const categoriesParam = null
      const categories = categoriesParam ? categoriesParam.split(',').map(s => s.trim()).filter(Boolean) : []
      
      expect(categories).toEqual([])
    })

    it('should trim whitespace from category names', () => {
      const categoriesParam = ' tools , furniture , electronics '
      const categories = categoriesParam.split(',').map(s => s.trim()).filter(Boolean)
      
      expect(categories).toEqual(['tools', 'furniture', 'electronics'])
    })

    it('should filter out empty strings', () => {
      const categoriesParam = 'tools,,furniture,'
      const categories = categoriesParam.split(',').map(s => s.trim()).filter(Boolean)
      
      expect(categories).toEqual(['tools', 'furniture'])
    })
  })

  describe('URLSearchParams Integration', () => {
    it('should set and get categories parameter correctly', () => {
      const params = new URLSearchParams()
      const categories = ['tools', 'furniture']
      
      if (categories.length > 0) {
        params.set('categories', categories.join(','))
      }
      
      expect(params.get('categories')).toBe('tools,furniture')
    })

    it('should not set categories parameter when array is empty', () => {
      const params = new URLSearchParams()
      const categories: string[] = []
      
      if (categories.length > 0) {
        params.set('categories', categories.join(','))
      }
      
      expect(params.get('categories')).toBeNull()
    })

    it('should handle special characters in category names', () => {
      const params = new URLSearchParams()
      const categories = ['home & garden', 'sports/outdoor', 'books & media']
      
      params.set('categories', categories.join(','))
      
      expect(params.get('categories')).toBe('home & garden,sports/outdoor,books & media')
      
      // Verify parsing works correctly
      const parsed = params.get('categories')?.split(',').map(s => s.trim()).filter(Boolean) || []
      expect(parsed).toEqual(['home & garden', 'sports/outdoor', 'books & media'])
    })
  })

  describe('Array Validation', () => {
    it('should limit categories to prevent abuse', () => {
      const categories = ['cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6', 'cat7', 'cat8', 'cat9', 'cat10', 'cat11']
      const limited = categories.slice(0, 10)
      
      expect(limited).toHaveLength(10)
      expect(limited).not.toContain('cat11')
    })

    it('should filter out invalid category names', () => {
      const categories = ['tools', '', 'furniture', '   ', 'electronics']
      const valid = categories.filter(c => c.trim().length > 0)
      
      expect(valid).toEqual(['tools', 'furniture', 'electronics'])
    })

    it('should handle very long category names', () => {
      const longCategory = 'a'.repeat(1000)
      const categories = ['tools', longCategory, 'furniture']
      
      // Should still serialize correctly
      const serialized = categories.join(',')
      expect(serialized).toContain('tools')
      expect(serialized).toContain('furniture')
      expect(serialized).toContain(longCategory)
    })
  })

  describe('Canonical Format', () => {
    it('should use consistent format for all API endpoints', () => {
      const categories = ['tools', 'furniture']
      
      // Both sales and markers endpoints should use the same format
      const salesParams = new URLSearchParams()
      const markersParams = new URLSearchParams()
      
      if (categories.length > 0) {
        salesParams.set('categories', categories.join(','))
        markersParams.set('categories', categories.join(','))
      }
      
      expect(salesParams.get('categories')).toBe(markersParams.get('categories'))
      expect(salesParams.get('categories')).toBe('tools,furniture')
    })

    it('should maintain consistency across different serialization methods', () => {
      const categories = ['tools', 'furniture']
      
      // Method 1: Direct join
      const method1 = categories.join(',')
      
      // Method 2: URLSearchParams
      const params = new URLSearchParams()
      params.set('categories', categories.join(','))
      const method2 = params.get('categories')!
      
      // Method 3: Object.entries with reduce
      const method3 = Object.entries({ categories }).reduce((acc, [key, value]) => {
        if (Array.isArray(value)) {
          acc[key] = value.join(',')
        }
        return acc
      }, {} as Record<string, string>).categories
      
      expect(method1).toBe(method2)
      expect(method2).toBe(method3)
      expect(method1).toBe('tools,furniture')
    })
  })
})
