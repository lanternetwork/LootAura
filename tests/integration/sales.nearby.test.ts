import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getNearestSalesForSale } from '@/lib/data/salesAccess'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock getRlsDb at the top level
const mockRlsDbRpc = vi.fn()
const mockGetRlsDb = vi.fn(() => ({
  rpc: mockRlsDbRpc,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: async (_request?: any) => mockGetRlsDb(),
}))

describe('getNearestSalesForSale', () => {
  let mockSupabase: SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock Supabase client
    mockSupabase = {
      from: vi.fn(),
      rpc: vi.fn(),
    } as any
  })

  it('returns empty array when sale not found', async () => {
    (mockSupabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        }),
      }),
    })

    const result = await getNearestSalesForSale(mockSupabase, 'invalid-id', 2)
    expect(result).toEqual([])
  })

  it('returns empty array when sale has no coordinates', async () => {
    (mockSupabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'sale-1', lat: null, lng: null },
            error: null,
          }),
        }),
      }),
    })

    const result = await getNearestSalesForSale(mockSupabase, 'sale-1', 2)
    expect(result).toEqual([])
  })

  it('excludes current sale from results', async () => {
    const currentSale = {
      id: 'sale-1',
      lat: 38.2527,
      lng: -85.7585,
    }

    const nearbySales = [
      { id: 'sale-1', distance_meters: 0 }, // Current sale
      { id: 'sale-2', distance_meters: 500 },
      { id: 'sale-3', distance_meters: 1000 },
    ];

    (mockSupabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: currentSale,
            error: null,
          }),
        }),
      }),
    })

    // Mock getRlsDb RPC call
    mockRlsDbRpc.mockResolvedValue({
      data: nearbySales,
      error: null,
    })

    const result = await getNearestSalesForSale(mockSupabase, 'sale-1', 2)
    
    // Should exclude sale-1 and return only sale-2 and sale-3
    expect(result.length).toBeLessThanOrEqual(2)
    expect(result.every((sale) => sale.id !== 'sale-1')).toBe(true)
  })

  it('respects limit parameter', async () => {
    const currentSale = {
      id: 'sale-1',
      lat: 38.2527,
      lng: -85.7585,
    }

    const nearbySales = [
      { id: 'sale-2', distance_meters: 500 },
      { id: 'sale-3', distance_meters: 1000 },
      { id: 'sale-4', distance_meters: 1500 },
    ];

    (mockSupabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: currentSale,
            error: null,
          }),
        }),
      }),
    })

    // Mock getRlsDb RPC call
    mockRlsDbRpc.mockResolvedValue({
      data: nearbySales,
      error: null,
    })

    const result = await getNearestSalesForSale(mockSupabase, 'sale-1', 2)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('returns empty array on error', async () => {
    (mockSupabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      }),
    })

    const result = await getNearestSalesForSale(mockSupabase, 'sale-1', 2)
    expect(result).toEqual([])
  })
})
