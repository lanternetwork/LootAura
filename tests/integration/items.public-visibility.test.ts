/**
 * Integration tests for items public visibility
 * Tests that items appear on sale detail pages for published, publicly visible sales
 * Regression test for migration 114 fix
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { getSaleWithItems } from '@/lib/data/salesAccess'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
  from: vi.fn(),
}

// Mock admin DB
const mockAdminDb = {
  from: vi.fn(),
}

// Mock RLS DB
const mockRlsDb = {
  from: vi.fn(),
}

// Create query chain helper - supports chaining multiple filters
// The chain must be awaitable and resolve to { data, error } when awaited
const createQueryChain = (data: any[] = [], error: any = null) => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    is: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve({ data, error })),
    limit: vi.fn(() => Promise.resolve({ data, error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: data[0] || null, error })),
    single: vi.fn(() => Promise.resolve({ data: data[0] || null, error })),
  }
  // Make the chain itself awaitable (when used without .limit() or .range())
  // This allows: await supabase.from('table').select('*').eq(...).order(...).limit(...)
  return Object.assign(chain, {
    then: (resolve: any) => resolve({ data, error }),
    catch: (reject: any) => reject(error),
  })
}

// Mock schema-scoped clients
vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => {
    if (table.includes('.')) {
      throw new Error(`Do not qualify table names: received "${table}"`)
    }
    return db.from(table)
  },
}))

// Mock server Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

describe('Items Public Visibility', () => {
  const publishedSale = {
    id: 'sale-published',
    title: 'Published Sale',
    status: 'published',
    moderation_status: 'visible',
    archived_at: null,
    owner_id: 'owner-1',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }

  const publishedSaleWithItems = {
    id: 'sale-published-items',
    title: 'Published Sale With Items',
    status: 'published',
    moderation_status: 'visible',
    archived_at: null,
    owner_id: 'owner-2',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    lat: 38.2527,
    lng: -85.7585,
  }

  const hiddenSale = {
    id: 'sale-hidden',
    title: 'Hidden Sale',
    status: 'published',
    moderation_status: 'hidden_by_admin',
    archived_at: null,
    owner_id: 'owner-3',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    lat: 38.2527,
    lng: -85.7585,
  }

  const mockItems = [
    {
      id: 'item-1',
      sale_id: 'sale-published-items',
      name: 'Test Item 1',
      price: 10.00,
      image_url: null,
      images: null,
      created_at: '2025-01-01T00:00:00Z',
      category: 'furniture',
      condition: 'good',
      is_sold: false,
    },
    {
      id: 'item-2',
      sale_id: 'sale-published-items',
      name: 'Test Item 2',
      price: 20.00,
      image_url: null,
      images: null,
      created_at: '2025-01-01T00:00:00Z',
      category: 'electronics',
      condition: 'excellent',
      is_sold: false,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: anonymous user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    // CRITICAL: Re-initialize from() mock after clearAllMocks()
    // clearAllMocks() clears implementations of ALL vi.fn() mocks
    // We need to set up a default implementation that can be overridden in tests
    mockSupabaseClient.from.mockImplementation(() => createQueryChain([], null))
    mockRlsDb.from.mockImplementation(() => createQueryChain([], null))
    mockAdminDb.from.mockImplementation(() => createQueryChain([], null))
  })

  it('should return items for published, visible sales to anonymous users', async () => {
    // Ensure auth.getUser is mocked (getSaleWithItems calls this)
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    // Mock sale query (from sales_v2 view)
    // Ensure the chain properly resolves when .single() is called
    const mockSaleSingleChain = {
      single: vi.fn().mockResolvedValue({
        data: publishedSaleWithItems,
        error: null,
      }),
    }
    const mockSaleEqChain = {
      eq: vi.fn(() => mockSaleSingleChain),
    }
    const mockSaleSelectChain = {
      select: vi.fn(() => mockSaleEqChain),
    }

    // Mock items query (from base table via RLS DB)
    // The order method returns a promise when it's the last method in the chain
    const mockItemsOrderChain = {
      order: vi.fn(() => Promise.resolve({ data: mockItems, error: null })),
    }
    const mockItemsEqChain = {
      eq: vi.fn(() => mockItemsOrderChain),
    }
    const mockItemsSelectChain = {
      select: vi.fn(() => mockItemsEqChain),
    }

    // Mock profiles and stats queries
    const mockMaybeSingleChain = {
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const mockProfilesEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockProfilesSelectChain = {
      select: vi.fn(() => mockProfilesEqChain),
    }
    const mockStatsEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockStatsSelectChain = {
      select: vi.fn(() => mockStatsEqChain),
    }

    // Set up mockSupabaseClient for sales_v2, profiles_v2, owner_stats
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return mockSaleSelectChain
      }
      if (table === 'profiles_v2') {
        return mockProfilesSelectChain
      }
      if (table === 'owner_stats') {
        return mockStatsSelectChain
      }
      return mockSaleSelectChain
    })

    // Set up mockRlsDb for items query
    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'items') {
        return mockItemsSelectChain
      }
      return mockItemsSelectChain
    })

    // Set up mockAdminDb for tags query and items check (admin check)
    // Note: getSaleWithItems uses fromBase(admin, 'sales') which calls admin.from('sales')
    const mockAdminItemsEqChain = {
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }
    const mockAdminItemsSelectChain = {
      select: vi.fn(() => mockAdminItemsEqChain),
    }
    
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'sales') {
        // Mock tags query - set up inline like the working test
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        }
      }
      if (table === 'items') {
        // Mock admin check for items (bypasses RLS)
        return mockAdminItemsSelectChain
      }
      return mockSaleSelectChain
    })

    // Call getSaleWithItems
    const result = await getSaleWithItems(mockSupabaseClient as any, 'sale-published-items')

    // Verify result
    expect(result).toBeDefined()
    expect(result?.sale.id).toBe('sale-published-items')
    expect(result?.sale.status).toBe('published')
    expect((result?.sale as any).moderation_status).toBe('visible')
    
    // CRITICAL: Items should be returned for published, visible sales
    expect(result?.items).toBeDefined()
    expect(Array.isArray(result?.items)).toBe(true)
    expect(result?.items.length).toBe(2)
    expect(result?.items[0].id).toBe('item-1')
    expect(result?.items[0].name).toBe('Test Item 1')
    expect(result?.items[1].id).toBe('item-2')
    expect(result?.items[1].name).toBe('Test Item 2')

    // Verify items query was called
    expect(mockRlsDb.from).toHaveBeenCalledWith('items')
    expect(mockItemsSelectChain.select).toHaveBeenCalled()
    expect(mockItemsEqChain.eq).toHaveBeenCalledWith('sale_id', 'sale-published-items')
  })

  it('should NOT return items for hidden sales to anonymous users', async () => {
    // Ensure auth.getUser is mocked (getSaleWithItems calls this)
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    // Mock sale query (from sales_v2 view) - hidden sale can still be fetched
    // (page component blocks it, but getSaleWithItems can return it)
    const mockSaleSingleChain = {
      single: vi.fn().mockResolvedValue({
        data: hiddenSale,
        error: null,
      }),
    }
    const mockSaleEqChain = {
      eq: vi.fn(() => mockSaleSingleChain),
    }
    const mockSaleSelectChain = {
      select: vi.fn(() => mockSaleEqChain),
    }

    // Mock items query - should return empty array due to RLS
    // The RLS policy should block items from hidden sales
    const mockItemsOrderChain = {
      order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }
    const mockItemsEqChain = {
      eq: vi.fn(() => mockItemsOrderChain),
    }
    const mockItemsSelectChain = {
      select: vi.fn(() => mockItemsEqChain),
    }

    // Mock profiles and stats queries
    const mockMaybeSingleChain = {
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const mockProfilesEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockProfilesSelectChain = {
      select: vi.fn(() => mockProfilesEqChain),
    }
    const mockStatsEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockStatsSelectChain = {
      select: vi.fn(() => mockStatsEqChain),
    }

    // Set up mocks
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return mockSaleSelectChain
      }
      if (table === 'profiles_v2') {
        return mockProfilesSelectChain
      }
      if (table === 'owner_stats') {
        return mockStatsSelectChain
      }
      return mockSaleSelectChain
    })

    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'items') {
        return mockItemsSelectChain
      }
      return mockItemsSelectChain
    })

    // Set up mockAdminDb for tags query and items check (admin check)
    // Note: getSaleWithItems uses fromBase(admin, 'sales') which calls admin.from('sales')
    const mockAdminItemsEqChain = {
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }
    const mockAdminItemsSelectChain = {
      select: vi.fn(() => mockAdminItemsEqChain),
    }
    
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'sales') {
        // Mock tags query - set up inline like the working test
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        }
      }
      if (table === 'items') {
        // Mock admin check for items (bypasses RLS)
        return mockAdminItemsSelectChain
      }
      return mockSaleSelectChain
    })

    // Call getSaleWithItems
    const result = await getSaleWithItems(mockSupabaseClient as any, 'sale-hidden')

    // Verify result
    expect(result).toBeDefined()
    expect(result?.sale.id).toBe('sale-hidden')
    expect((result?.sale as any).moderation_status).toBe('hidden_by_admin')
    
    // CRITICAL: Items should NOT be returned for hidden sales
    expect(result?.items).toBeDefined()
    expect(Array.isArray(result?.items)).toBe(true)
    expect(result?.items.length).toBe(0) // RLS should block items

    // Verify items query was called (but returned empty due to RLS)
    expect(mockRlsDb.from).toHaveBeenCalledWith('items')
  })

  it('should return items for published sales with active status', async () => {
    // Ensure auth.getUser is mocked (getSaleWithItems calls this)
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const activeSale = {
      ...publishedSaleWithItems,
      id: 'sale-active',
      status: 'active',
    }

    // Mock sale query
    const mockSaleSingleChain = {
      single: vi.fn().mockResolvedValue({
        data: activeSale,
        error: null,
      }),
    }
    const mockSaleEqChain = {
      eq: vi.fn(() => mockSaleSingleChain),
    }
    const mockSaleSelectChain = {
      select: vi.fn(() => mockSaleEqChain),
    }

    // Mock items query
    const mockItemsOrderChain = {
      order: vi.fn(() => Promise.resolve({ data: mockItems, error: null })),
    }
    const mockItemsEqChain = {
      eq: vi.fn(() => mockItemsOrderChain),
    }
    const mockItemsSelectChain = {
      select: vi.fn(() => mockItemsEqChain),
    }

    // Mock profiles and stats
    const mockMaybeSingleChain = {
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const mockProfilesEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockProfilesSelectChain = {
      select: vi.fn(() => mockProfilesEqChain),
    }
    const mockStatsEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockStatsSelectChain = {
      select: vi.fn(() => mockStatsEqChain),
    }

    // Set up mocks
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return mockSaleSelectChain
      }
      if (table === 'profiles_v2') {
        return mockProfilesSelectChain
      }
      if (table === 'owner_stats') {
        return mockStatsSelectChain
      }
      return mockSaleSelectChain
    })

    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'items') {
        return mockItemsSelectChain
      }
      return mockItemsSelectChain
    })

    // Set up mockAdminDb for tags query and items check (admin check)
    // Note: getSaleWithItems uses fromBase(admin, 'sales') which calls admin.from('sales')
    const mockAdminItemsEqChain = {
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }
    const mockAdminItemsSelectChain = {
      select: vi.fn(() => mockAdminItemsEqChain),
    }
    
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'sales') {
        // Mock tags query - set up inline like the working test
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        }
      }
      if (table === 'items') {
        // Mock admin check for items (bypasses RLS)
        return mockAdminItemsSelectChain
      }
      return mockSaleSelectChain
    })

    // Call getSaleWithItems
    const result = await getSaleWithItems(mockSupabaseClient as any, 'sale-active')

    // Verify result
    expect(result).toBeDefined()
    expect(result?.sale.id).toBe('sale-active')
    expect(result?.sale.status).toBe('active')
    
    // Items should be returned for active sales
    expect(result?.items).toBeDefined()
    expect(Array.isArray(result?.items)).toBe(true)
    expect(result?.items.length).toBe(2)
  })

  it('should NOT return items for archived sales', async () => {
    // Ensure auth.getUser is mocked (getSaleWithItems calls this)
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const archivedSale = {
      ...publishedSaleWithItems,
      id: 'sale-archived',
      archived_at: '2025-01-01T00:00:00Z',
    }

    // Mock sale query
    const mockSaleSingleChain = {
      single: vi.fn().mockResolvedValue({
        data: archivedSale,
        error: null,
      }),
    }
    const mockSaleEqChain = {
      eq: vi.fn(() => mockSaleSingleChain),
    }
    const mockSaleSelectChain = {
      select: vi.fn(() => mockSaleEqChain),
    }

    // Mock items query - should return empty due to RLS
    const mockItemsOrderChain = {
      order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }
    const mockItemsEqChain = {
      eq: vi.fn(() => mockItemsOrderChain),
    }
    const mockItemsSelectChain = {
      select: vi.fn(() => mockItemsEqChain),
    }

    // Mock profiles and stats
    const mockMaybeSingleChain = {
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const mockProfilesEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockProfilesSelectChain = {
      select: vi.fn(() => mockProfilesEqChain),
    }
    const mockStatsEqChain = {
      eq: vi.fn(() => mockMaybeSingleChain),
    }
    const mockStatsSelectChain = {
      select: vi.fn(() => mockStatsEqChain),
    }

    // Set up mocks
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sales_v2') {
        return mockSaleSelectChain
      }
      if (table === 'profiles_v2') {
        return mockProfilesSelectChain
      }
      if (table === 'owner_stats') {
        return mockStatsSelectChain
      }
      return mockSaleSelectChain
    })

    mockRlsDb.from.mockImplementation((table: string) => {
      if (table === 'items') {
        return mockItemsSelectChain
      }
      return mockItemsSelectChain
    })

    // Set up mockAdminDb for tags query and items check (admin check)
    // Note: getSaleWithItems uses fromBase(admin, 'sales') which calls admin.from('sales')
    const mockAdminItemsEqChain = {
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }
    const mockAdminItemsSelectChain = {
      select: vi.fn(() => mockAdminItemsEqChain),
    }
    
    mockAdminDb.from.mockImplementation((table: string) => {
      if (table === 'sales') {
        // Mock tags query - set up inline like the working test
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        }
      }
      if (table === 'items') {
        // Mock admin check for items (bypasses RLS)
        return mockAdminItemsSelectChain
      }
      return mockSaleSelectChain
    })

    // Call getSaleWithItems
    const result = await getSaleWithItems(mockSupabaseClient as any, 'sale-archived')

    // Verify result
    expect(result).toBeDefined()
    expect(result?.sale.id).toBe('sale-archived')
    expect(result?.sale.archived_at).toBe('2025-01-01T00:00:00Z')
    
    // Items should NOT be returned for archived sales
    expect(result?.items).toBeDefined()
    expect(Array.isArray(result?.items)).toBe(true)
    expect(result?.items.length).toBe(0) // RLS should block items
  })
})

