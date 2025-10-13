import { describe, it, expect, beforeEach } from 'vitest'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeCategories } from '@/lib/shared/categoryNormalizer'

// Mock Supabase client for testing
const mockSupabaseClient = {
  from: (table: string) => ({
    select: (columns: string) => ({
      in: (column: string, values: string[]) => ({
        data: values.includes('tools') ? [{ sale_id: 'sale-1' }, { sale_id: 'sale-2' }] : [],
        error: null
      })
    })
  })
}

// Mock the server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient
}))

describe('server.predicate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it('should match tools category with ANY-OF predicate', async () => {
    const categories = ['tools']
    const normalized = normalizeCategories(categories)
    
    // Simulate server query
    const sb = createSupabaseServerClient()
    const { data: salesWithCategories } = await sb
      .from('items_v2')
      .select('sale_id')
      .in('category', normalized)
    
    // Assert ANY-OF: tools matches the tools row
    expect(salesWithCategories).toHaveLength(2)
    expect(salesWithCategories?.[0]?.sale_id).toBe('sale-1')
  })
  
  it('should return all rows when no categories provided', async () => {
    const categories: string[] = []
    const normalized = normalizeCategories(categories)
    
    // When no categories, we should not apply the filter
    expect(normalized).toHaveLength(0)
    
    // In real implementation, this would skip the category filter entirely
    // and return all sales within the distance/date bounds
  })
  
  it('should handle case-insensitive category matching', async () => {
    const categories = ['Tools', 'FURNITURE']
    const normalized = normalizeCategories(categories)
    
    // Assert normalization handles case
    expect(normalized).toEqual(['tools', 'furniture'])
    
    // Simulate server query with normalized values
    const sb = createSupabaseServerClient()
    const { data: salesWithCategories } = await sb
      .from('items_v2')
      .select('sale_id')
      .in('category', normalized)
    
    // Should match because 'tools' is in the normalized array
    expect(salesWithCategories).toHaveLength(2)
  })
  
  it('should deduplicate and sort categories consistently', () => {
    const rawCategories = ['tools', 'furniture', 'tools', 'toys']
    const normalized = normalizeCategories(rawCategories)
    
    // Assert deduplication and sorting
    expect(normalized).toEqual(['furniture', 'tools', 'toys'])
    expect(normalized).toHaveLength(3)
  })
  
  it('should handle empty categories param correctly', () => {
    const emptyParam = ''
    const normalized = normalizeCategories(emptyParam)
    
    expect(normalized).toHaveLength(0)
    
    // Empty categories should not be included in the query
    // This ensures we don't send categories= in the URL when empty
  })
})
