import { describe, it, expect } from 'vitest'
import { normalizeSalesJson, SalesResponseSchema } from '@/lib/data/sales-schemas'

describe('ZIP Contract Test', () => {
  it('should normalize array response', () => {
    const arrayResponse = [
      { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724 },
      { id: '2', title: 'Sale 2', lat: 38.240, lng: -85.726 }
    ]
    
    const normalized = normalizeSalesJson(arrayResponse)
    const parsed = SalesResponseSchema.safeParse(normalized)
    
    expect(parsed.success).toBe(true)
    expect(parsed.data?.sales).toHaveLength(2)
    expect(parsed.data?.meta?.shape).toBe('array')
  })

  it('should normalize object response', () => {
    const objectResponse = {
      sales: [
        { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724 },
        { id: '2', title: 'Sale 2', lat: 38.240, lng: -85.726 }
      ],
      count: 2,
      center: { lat: 38.239, lng: -85.725 }
    }
    
    const normalized = normalizeSalesJson(objectResponse)
    const parsed = SalesResponseSchema.safeParse(normalized)
    
    expect(parsed.success).toBe(true)
    expect(parsed.data?.sales).toHaveLength(2)
    expect(parsed.data?.meta?.shape).toBe('object')
    expect(parsed.data?.meta?.count).toBe(2)
  })

  it('should handle garbage input', () => {
    const garbageInput = { invalid: 'data', notSales: true }
    
    const normalized = normalizeSalesJson(garbageInput)
    const parsed = SalesResponseSchema.safeParse(normalized)
    
    expect(parsed.success).toBe(true)
    expect(parsed.data?.sales).toHaveLength(0)
    expect(parsed.data?.meta?.shape).toBe('invalid')
  })

  it('should never call .filter on raw json', () => {
    const arrayResponse = [
      { id: '1', title: 'Sale 1', lat: 38.238, lng: -85.724 }
    ]
    
    // Mock Array.prototype.filter to ensure it's not called
    const originalFilter = Array.prototype.filter
    const filterSpy = vi.fn()
    Array.prototype.filter = filterSpy
    
    try {
      const normalized = normalizeSalesJson(arrayResponse)
      const parsed = SalesResponseSchema.safeParse(normalized)
      
      expect(parsed.success).toBe(true)
      expect(filterSpy).not.toHaveBeenCalled()
    } finally {
      Array.prototype.filter = originalFilter
    }
  })
})
