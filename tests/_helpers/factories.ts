import { Sale } from '@/lib/types'

/**
 * Factory function to create Sale objects for testing
 * Provides sensible defaults and allows overriding specific fields
 */
export function makeSale(overrides: Partial<Sale> = {}): Sale {
  const now = new Date().toISOString()
  const id = Math.random().toString(36).substring(2, 15)
  
  return {
    id,
    owner_id: 'test-user-id',
    title: 'Test Sale',
    description: 'Test description',
    address: '123 Test St',
    city: 'Test City',
    state: 'KY',
    zip_code: '40202',
    lat: 38.1405,
    lng: -85.6936,
    date_start: '2025-01-15',
    time_start: '09:00',
    date_end: '2025-01-15',
    time_end: '17:00',
    price: 50,
    tags: ['test'],
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: now,
    updated_at: now,
    ...overrides
  }
}

/**
 * Create multiple Sale objects with different properties
 */
export function makeSales(count: number, overrides: Partial<Sale>[] = []): Sale[] {
  return Array.from({ length: count }, (_, i) => 
    makeSale({
      id: `sale-${i + 1}`,
      title: `Sale ${i + 1}`,
      description: `Description ${i + 1}`,
      ...overrides[i]
    })
  )
}
