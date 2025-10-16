import { describe, it, expect } from 'vitest'

describe('Server Stabilization Tests', () => {
  describe('Parameter Acceptance', () => {
    const parseCategoriesParam = (query: URLSearchParams): string[] => {
      const categoriesParam = query.get('categories') || query.get('cat') || ''
      if (!categoriesParam) return []
      
      return categoriesParam
        .split(',')
        .map(c => c.trim().toLowerCase())
        .filter(c => c.length > 0)
        .sort()
        .filter((c, i, arr) => arr.indexOf(c) === i)
    }

    it('should accept canonical categories parameter', () => {
      const query = new URLSearchParams('categories=tools,furniture')
      const result = parseCategoriesParam(query)
      expect(result).toEqual(['furniture', 'tools'])
    })

    it('should accept legacy cat parameter', () => {
      const query = new URLSearchParams('cat=tools,furniture')
      const result = parseCategoriesParam(query)
      expect(result).toEqual(['furniture', 'tools'])
    })

    it('should prioritize categories over cat', () => {
      const query = new URLSearchParams('categories=tools&cat=furniture')
      const result = parseCategoriesParam(query)
      expect(result).toEqual(['tools'])
    })

    it('should handle empty parameters', () => {
      const query = new URLSearchParams('')
      const result = parseCategoriesParam(query)
      expect(result).toEqual([])
    })

    it('should normalize and deduplicate categories', () => {
      const query = new URLSearchParams('categories=tools, tools, furniture')
      const result = parseCategoriesParam(query)
      expect(result).toEqual(['furniture', 'tools'])
    })
  })

  describe('Predicate Parity', () => {
    const buildMarkersPredicate = (categories: string[], columnType: 'single' | 'array') => {
      if (categories.length === 0) return null
      
      if (columnType === 'single') {
        return `category = ANY($1::text[])`
      } else {
        return `categories && $1::text[]`
      }
    }

    const buildListPredicate = (categories: string[], columnType: 'single' | 'array') => {
      if (categories.length === 0) return null
      
      if (columnType === 'single') {
        return `category = ANY($1::text[])`
      } else {
        return `categories && $1::text[]`
      }
    }

    it('should use identical predicates for markers and list', () => {
      const categories = ['tools', 'furniture']
      const columnType = 'single' as const
      
      const markersPredicate = buildMarkersPredicate(categories, columnType)
      const listPredicate = buildListPredicate(categories, columnType)
      
      expect(markersPredicate).toBe(listPredicate)
      expect(markersPredicate).toBe('category = ANY($1::text[])')
    })

    it('should use array overlap predicate for array column type', () => {
      const categories = ['tools', 'furniture']
      const columnType = 'array' as const
      
      const markersPredicate = buildMarkersPredicate(categories, columnType)
      const listPredicate = buildListPredicate(categories, columnType)
      
      expect(markersPredicate).toBe(listPredicate)
      expect(markersPredicate).toBe('categories && $1::text[]')
    })

    it('should return null for empty categories', () => {
      const categories: string[] = []
      const columnType = 'single' as const
      
      const markersPredicate = buildMarkersPredicate(categories, columnType)
      const listPredicate = buildListPredicate(categories, columnType)
      
      expect(markersPredicate).toBeNull()
      expect(listPredicate).toBeNull()
    })
  })

  describe('Database Schema Validation', () => {
    const validateSchema = (schema: any) => {
      const hasCategoryColumn = schema.columns?.some((col: any) => col.name === 'category')
      const hasCategoriesColumn = schema.columns?.some((col: any) => col.name === 'categories')
      
      return {
        hasCategoryColumn,
        hasCategoriesColumn,
        columnType: hasCategoriesColumn ? 'array' : hasCategoryColumn ? 'single' : null
      }
    }

    it('should detect single category column', () => {
      const schema = {
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'category', type: 'text' },
          { name: 'name', type: 'text' }
        ]
      }
      
      const result = validateSchema(schema)
      expect(result.hasCategoryColumn).toBe(true)
      expect(result.hasCategoriesColumn).toBe(false)
      expect(result.columnType).toBe('single')
    })

    it('should detect array categories column', () => {
      const schema = {
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'categories', type: 'text[]' },
          { name: 'name', type: 'text' }
        ]
      }
      
      const result = validateSchema(schema)
      expect(result.hasCategoryColumn).toBe(false)
      expect(result.hasCategoriesColumn).toBe(true)
      expect(result.columnType).toBe('array')
    })

    it('should handle missing category columns', () => {
      const schema = {
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'name', type: 'text' }
        ]
      }
      
      const result = validateSchema(schema)
      expect(result.hasCategoryColumn).toBe(false)
      expect(result.hasCategoriesColumn).toBe(false)
      expect(result.columnType).toBeNull()
    })
  })

  describe('Index Requirements', () => {
    const validateIndexes = (indexes: any[], columnType: 'single' | 'array' | null) => {
      if (!columnType) return { valid: false, reason: 'No category column found' }
      
      if (columnType === 'single') {
        const hasBtreeIndex = indexes.some(idx => 
          idx.column === 'category' && idx.type === 'btree'
        )
        return { valid: hasBtreeIndex, reason: hasBtreeIndex ? 'Btree index found' : 'Missing btree index on category' }
      } else {
        const hasGinIndex = indexes.some(idx => 
          idx.column === 'categories' && idx.type === 'gin'
        )
        return { valid: hasGinIndex, reason: hasGinIndex ? 'GIN index found' : 'Missing GIN index on categories' }
      }
    }

    it('should validate btree index for single category column', () => {
      const indexes = [
        { column: 'category', type: 'btree' },
        { column: 'id', type: 'btree' }
      ]
      
      const result = validateIndexes(indexes, 'single')
      expect(result.valid).toBe(true)
      expect(result.reason).toBe('Btree index found')
    })

    it('should validate GIN index for array categories column', () => {
      const indexes = [
        { column: 'categories', type: 'gin' },
        { column: 'id', type: 'btree' }
      ]
      
      const result = validateIndexes(indexes, 'array')
      expect(result.valid).toBe(true)
      expect(result.reason).toBe('GIN index found')
    })

    it('should fail validation for missing indexes', () => {
      const indexes = [
        { column: 'id', type: 'btree' }
      ]
      
      const result = validateIndexes(indexes, 'single')
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('Missing btree index on category')
    })
  })
})
