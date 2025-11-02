import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSaleById } from '@/lib/data'

const saleId = 'test-sale-id'
const ownerId = 'test-owner-id'
const createdAt = new Date('2024-01-15T10:00:00Z').toISOString()

// Create mock Supabase client with proper chainable methods
const createMockFrom = (tableName: string, saleData?: any, profileData?: any, statsData?: any) => {
  const chain: any = {}
  
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  
  if (tableName === 'sales_v2') {
    chain.single = vi.fn().mockResolvedValue({
      data: saleData || {
        id: saleId,
        owner_id: ownerId,
        title: 'Test Sale',
        city: 'Louisville',
        state: 'KY',
        date_start: '2024-01-20',
        time_start: '09:00',
      },
      error: null,
    })
  } else if (tableName === 'profiles_v2') {
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: profileData || {
        id: ownerId,
        created_at: createdAt,
        full_name: 'Test User',
      },
      error: null,
    })
  } else if (tableName === 'owner_stats') {
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: statsData || {
        user_id: ownerId,
        total_sales: 5,
        last_sale_at: new Date().toISOString(),
        avg_rating: 4.5,
        ratings_count: 10,
      },
      error: null,
    })
  } else {
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  }
  
  return chain
}

const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
  from: vi.fn((table: string) => createMockFrom(table)),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

describe('Sale Detail API - Owner Stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default mock implementation
    mockSupabaseClient.from.mockImplementation((table: string) => createMockFrom(table))
  })

  it('should include owner_profile and owner_stats in sale detail response', async () => {
    const result = await getSaleById(saleId)

    expect(result).toBeTruthy()
    expect(result?.owner_profile).toBeTruthy()
    expect(result?.owner_profile?.created_at).toBe(createdAt)
    expect(result?.owner_profile?.full_name).toBe('Test User')
    expect(result?.owner_stats).toBeTruthy()
    expect(result?.owner_stats?.total_sales).toBe(5)
    expect(typeof result?.owner_stats?.total_sales).toBe('number')
    expect(result?.owner_stats?.avg_rating).toBe(4.5)
    expect(result?.owner_stats?.ratings_count).toBe(10)
  })

  it('should return default stats when owner_stats is missing', async () => {
    // Override mock for this test to return null for profile and stats
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'profiles_v2' || table === 'owner_stats') {
        return createMockFrom(table, undefined, null, null)
      }
      return createMockFrom(table)
    })

    const result = await getSaleById(saleId)

    expect(result).toBeTruthy()
    expect(result?.owner_profile).toBeNull()
    expect(result?.owner_stats).toBeTruthy()
    expect(result?.owner_stats?.total_sales).toBe(0)
    expect(result?.owner_stats?.avg_rating).toBe(5.0)
    expect(result?.owner_stats?.ratings_count).toBe(0)
  })
})

