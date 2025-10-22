import { describe, it, expect } from 'vitest'
import { normalizeSalesJson } from '@/lib/data/sales-schemas'
import { deduplicateSales } from '@/lib/sales/dedupe'

describe('Sales Contract', () => {
  it('normalizes array format', () => {
    const salesArray = [
      { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724, address: '123 Main St', city: 'Louisville', state: 'KY', zip_code: '40204', date_start: '2025-01-01', status: 'published', created_at: '2025-01-01T00:00:00Z' },
      { id: '2', title: 'Sale 2', lat: 38.240, lng: -85.726, address: '456 Oak Ave', city: 'Louisville', state: 'KY', zip_code: '40204', date_start: '2025-01-02', status: 'published', created_at: '2025-01-02T00:00:00Z' }
    ]
    
    const normalized = normalizeSalesJson(salesArray)
    expect(normalized.sales).toHaveLength(2)
    expect(normalized.meta.total).toBe(2)
  })

  it('normalizes object format', () => {
    const salesObject = {
      sales: [
        { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724, address: '123 Main St', city: 'Louisville', state: 'KY', zip_code: '40204', date_start: '2025-01-01', status: 'published', created_at: '2025-01-01T00:00:00Z' }
      ],
      meta: { total: 1 }
    }
    
    const normalized = normalizeSalesJson(salesObject)
    expect(normalized.sales).toHaveLength(1)
    expect(normalized.meta.total).toBe(1)
  })

  it('handles empty array', () => {
    const normalized = normalizeSalesJson([])
    expect(normalized.sales).toHaveLength(0)
    expect(normalized.meta.total).toBe(0)
  })

  it('handles invalid data gracefully', () => {
    const normalized = normalizeSalesJson({ invalid: 'data' })
    expect(normalized.sales).toHaveLength(0)
    expect(normalized.meta.parse).toBe('failed')
  })
})

describe('Sales Deduplication', () => {
  it('deduplicates sales by id', () => {
    const sales = [
      { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724, address: '123 Main St', city: 'Louisville', state: 'KY', zip_code: '40204', date_start: '2025-01-01', status: 'published', created_at: '2025-01-01T00:00:00Z' },
      { id: '1', title: 'Sale 1 Duplicate', lat: 38.238, lng: -85.724, address: '123 Main St', city: 'Louisville', state: 'KY', zip_code: '40204', date_start: '2025-01-01', status: 'published', created_at: '2025-01-01T00:00:00Z' },
      { id: '2', title: 'Sale 2', lat: 38.240, lng: -85.726, address: '456 Oak Ave', city: 'Louisville', state: 'KY', zip_code: '40204', date_start: '2025-01-02', status: 'published', created_at: '2025-01-02T00:00:00Z' }
    ]
    
    const deduplicated = deduplicateSales(sales)
    expect(deduplicated).toHaveLength(2)
    expect(deduplicated.map(s => s.id)).toEqual(['1', '2'])
  })
})
