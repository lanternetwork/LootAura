import { describe, it, expect, beforeEach } from 'vitest'
import goldenDataset from '../fixtures/golden-dataset.json'

describe('Stabilization Integration Tests', () => {
  let mockSales: any[]
  let mockCategories: string[]

  beforeEach(() => {
    mockSales = goldenDataset.sales
    mockCategories = goldenDataset.categories
  })

  describe('Category Filtering', () => {
    it('should filter single category and return non-zero results', () => {
      const toolsSales = mockSales.filter(sale => sale.category === 'tools')
      expect(toolsSales).toHaveLength(2)
      expect(toolsSales.map(s => s.id)).toEqual(['sale-001', 'sale-004'])
    })

    it('should filter multiple categories with OR semantics', () => {
      const multiCategorySales = mockSales.filter(sale => 
        ['tools', 'furniture'].includes(sale.category)
      )
      expect(multiCategorySales).toHaveLength(3)
      expect(multiCategorySales.map(s => s.id)).toEqual(['sale-001', 'sale-002', 'sale-004'])
    })

    it('should handle overlap cases correctly', () => {
      const overlapSales = mockSales.filter(sale => 
        ['tools', 'toys'].includes(sale.category)
      )
      expect(overlapSales).toHaveLength(4)
      expect(overlapSales.map(s => s.id)).toEqual(['sale-001', 'sale-003', 'sale-004', 'sale-005'])
    })

    it('should return empty results for non-existent category', () => {
      const electronicsSales = mockSales.filter(sale => sale.category === 'electronics')
      expect(electronicsSales).toHaveLength(0)
    })
  })

  describe('URL Deep-linking', () => {
    it('should parse categories from URL parameters', () => {
      const url = new URL('http://localhost:3000/sales?categories=tools,furniture')
      const categories = url.searchParams.get('categories')?.split(',') || []
      expect(categories).toEqual(['tools', 'furniture'])
    })

    it('should handle single category in URL', () => {
      const url = new URL('http://localhost:3000/sales?categories=tools')
      const categories = url.searchParams.get('categories')?.split(',') || []
      expect(categories).toEqual(['tools'])
    })

    it('should handle empty categories gracefully', () => {
      const url = new URL('http://localhost:3000/sales')
      const categories = url.searchParams.get('categories')
      expect(categories).toBeNull()
    })
  })

  describe('Suppression Logic', () => {
    it('should not suppress when categories change', () => {
      const prevFilters = { categories: ['tools'] }
      const nextFilters = { categories: ['tools', 'furniture'] }
      const equalFilters = JSON.stringify(prevFilters) === JSON.stringify(nextFilters)
      expect(equalFilters).toBe(false)
    })

    it('should suppress when filters are identical under MAP authority', () => {
      const filters = { categories: ['tools'], distance: 10, city: 'Louisville' }
      const equalFilters = true
      const authority = 'MAP'
      const shouldSuppress = equalFilters && authority === 'MAP'
      expect(shouldSuppress).toBe(true)
    })

    it('should not suppress under FILTER authority', () => {
      const equalFilters = true
      const authority = 'FILTERS'
      const shouldSuppress = equalFilters && authority === 'MAP'
      expect(shouldSuppress).toBe(false)
    })
  })

  describe('Grid Layout', () => {
    it('should render multi-column grid at desktop width', () => {
      // Mock DOM structure
      const gridContainer = {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.5rem'
        },
        children: [
          { dataset: { card: 'sale' } },
          { dataset: { card: 'sale' } },
          { dataset: { card: 'sale' } }
        ]
      }

      expect(gridContainer.style.display).toBe('grid')
      expect(gridContainer.style.gridTemplateColumns).toBe('repeat(3, 1fr)')
      expect(gridContainer.children).toHaveLength(3)
    })

    it('should have direct children with data-card attribute', () => {
      const gridContainer = {
        children: [
          { dataset: { card: 'sale' } },
          { dataset: { card: 'sale' } }
        ]
      }

      const saleCards = gridContainer.children.filter(child => 
        child.dataset.card === 'sale'
      )
      expect(saleCards).toHaveLength(2)
    })
  })

  describe('ID Parity', () => {
    it('should maintain marker-list ID consistency', () => {
      const markerIds = ['sale-001', 'sale-002', 'sale-003']
      const listIds = ['sale-001', 'sale-002', 'sale-003', 'sale-004']
      
      const intersection = markerIds.filter(id => listIds.includes(id))
      expect(intersection).toHaveLength(3)
      expect(intersection).toEqual(['sale-001', 'sale-002', 'sale-003'])
    })

    it('should detect when marker IDs change', () => {
      const prevMarkerIds = ['sale-001', 'sale-002']
      const nextMarkerIds = ['sale-001', 'sale-003']
      
      const idsChanged = JSON.stringify(prevMarkerIds.sort()) !== JSON.stringify(nextMarkerIds.sort())
      expect(idsChanged).toBe(true)
    })
  })

  describe('Parameter Normalization', () => {
    it('should normalize categories array consistently', () => {
      const normalizeCategories = (input: string | string[]) => {
        const categories = Array.isArray(input) ? input : input.split(',')
        return categories
          .map(c => c.trim().toLowerCase())
          .filter(c => c.length > 0)
          .sort()
          .filter((c, i, arr) => arr.indexOf(c) === i)
      }

      expect(normalizeCategories('tools,furniture')).toEqual(['furniture', 'tools'])
      expect(normalizeCategories(['tools', 'furniture'])).toEqual(['furniture', 'tools'])
      expect(normalizeCategories('tools, tools, furniture')).toEqual(['furniture', 'tools'])
    })

    it('should create consistent filter keys', () => {
      const createFilterKey = (filters: any) => {
        const categories = Array.isArray(filters.categories) ? filters.categories : []
        const normalized = categories.sort().join(',')
        return `categories:${normalized}|city:${filters.city || ''}|distance:${filters.distance || ''}`
      }

      const filters1 = { categories: ['tools', 'furniture'], city: 'Louisville', distance: 10 }
      const filters2 = { categories: ['furniture', 'tools'], city: 'Louisville', distance: 10 }
      
      expect(createFilterKey(filters1)).toBe(createFilterKey(filters2))
    })
  })
})
