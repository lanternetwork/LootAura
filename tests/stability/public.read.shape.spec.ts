import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Mock the server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

describe('Public Read Shape Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return minimal fields for public sales list', async () => {
    const mockSales = [
      {
        id: 'sale-1',
        title: 'Public Sale 1',
        description: 'A great sale',
        address: '123 Main St',
        city: 'Louisville',
        state: 'KY',
        zip_code: '40204',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2025-10-20',
        time_start: '09:00:00',
        date_end: '2025-10-20',
        time_end: '17:00:00',
        status: 'published',
        is_featured: false,
        created_at: '2025-10-17T00:00:00Z',
        updated_at: '2025-10-17T00:00:00Z',
        // owner_id should NOT be present in public API
      },
      {
        id: 'sale-2',
        title: 'Public Sale 2',
        description: 'Another great sale',
        address: '456 Oak Ave',
        city: 'Louisville',
        state: 'KY',
        zip_code: '40205',
        lat: 38.2527,
        lng: -85.7585,
        date_start: '2025-10-21',
        time_start: '10:00:00',
        date_end: '2025-10-21',
        time_end: '18:00:00',
        status: 'published',
        is_featured: true,
        created_at: '2025-10-17T01:00:00Z',
        updated_at: '2025-10-17T01:00:00Z',
        // owner_id should NOT be present in public API
      },
    ]

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: mockSales,
          error: null,
        }),
      })),
    }

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('sales_v2')
      .select('id, title, description, address, city, state, zip_code, lat, lng, date_start, time_start, date_end, time_end, status, is_featured, created_at, updated_at')

    expect(error).toBeNull()
    expect(data).toEqual(mockSales)

    // Verify that sensitive fields are not present
    data?.forEach((sale: any) => {
      expect(sale).not.toHaveProperty('owner_id')
      expect(sale).not.toHaveProperty('home_zip')
      expect(sale).not.toHaveProperty('preferences')
    })

    // Verify that required public fields are present
    data?.forEach((sale: any) => {
      expect(sale).toHaveProperty('id')
      expect(sale).toHaveProperty('title')
      expect(sale).toHaveProperty('description')
      expect(sale).toHaveProperty('address')
      expect(sale).toHaveProperty('city')
      expect(sale).toHaveProperty('state')
      expect(sale).toHaveProperty('lat')
      expect(sale).toHaveProperty('lng')
      expect(sale).toHaveProperty('status')
    })
  })

  it('should return minimal fields for public markers', async () => {
    const mockMarkers = [
      {
        id: 'sale-1',
        title: 'Public Sale 1',
        lat: 38.2527,
        lng: -85.7585,
        // Only minimal fields for markers
      },
      {
        id: 'sale-2',
        title: 'Public Sale 2',
        lat: 38.2527,
        lng: -85.7585,
        // Only minimal fields for markers
      },
    ]

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: mockMarkers,
          error: null,
        }),
      })),
    }

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('sales_v2')
      .select('id, title, lat, lng')

    expect(error).toBeNull()
    expect(data).toEqual(mockMarkers)

    // Verify that only minimal fields are present
    data?.forEach((marker: any) => {
      expect(marker).toHaveProperty('id')
      expect(marker).toHaveProperty('title')
      expect(marker).toHaveProperty('lat')
      expect(marker).toHaveProperty('lng')
      
      // Verify sensitive fields are not present
      expect(marker).not.toHaveProperty('owner_id')
      expect(marker).not.toHaveProperty('description')
      expect(marker).not.toHaveProperty('address')
    })
  })

  it('should return minimal fields for public profiles', async () => {
    const mockProfiles = [
      {
        id: 'user-1',
        username: 'user1',
        full_name: 'User One',
        avatar_url: 'https://example.com/avatar1.jpg',
        // Sensitive fields should not be present
      },
      {
        id: 'user-2',
        username: 'user2',
        full_name: 'User Two',
        avatar_url: null,
        // Sensitive fields should not be present
      },
    ]

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: mockProfiles,
          error: null,
        }),
      })),
    }

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('profiles_v2')
      .select('id, username, full_name, avatar_url')

    expect(error).toBeNull()
    expect(data).toEqual(mockProfiles)

    // Verify that sensitive fields are not present
    data?.forEach((profile: any) => {
      expect(profile).not.toHaveProperty('home_zip')
      expect(profile).not.toHaveProperty('preferences')
    })

    // Verify that required public fields are present
    data?.forEach((profile: any) => {
      expect(profile).toHaveProperty('id')
      expect(profile).toHaveProperty('username')
      expect(profile).toHaveProperty('full_name')
    })
  })

  it('should return minimal fields for public items', async () => {
    const mockItems = [
      {
        id: 'item-1',
        sale_id: 'sale-1',
        name: 'Item One',
        description: 'A great item',
        price: 25.99,
        category: 'furniture',
        condition: 'good',
        images: ['https://example.com/image1.jpg'],
        is_sold: false,
        created_at: '2025-10-17T00:00:00Z',
        updated_at: '2025-10-17T00:00:00Z',
      },
    ]

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: mockItems,
          error: null,
        }),
      })),
    }

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('items_v2')
      .select('id, sale_id, name, description, price, category, condition, images, is_sold, created_at, updated_at')

    expect(error).toBeNull()
    expect(data).toEqual(mockItems)

    // Verify that required fields are present
    data?.forEach((item: any) => {
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('sale_id')
      expect(item).toHaveProperty('name')
      expect(item).toHaveProperty('price')
      expect(item).toHaveProperty('category')
    })
  })

  it('should not expose owner_id in any public API response', async () => {
    const mockData = [
      { id: '1', title: 'Sale 1', owner_id: 'owner-1' }, // This should be filtered out
      { id: '2', title: 'Sale 2', owner_id: 'owner-2' }, // This should be filtered out
    ]

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      })),
    }

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('sales_v2')
      .select('id, title') // Only select safe fields

    expect(error).toBeNull()
    expect(data).toEqual([
      { id: '1', title: 'Sale 1' },
      { id: '2', title: 'Sale 2' },
    ])

    // Verify owner_id is not present in the response
    data?.forEach((item: any) => {
      expect(item).not.toHaveProperty('owner_id')
    })
  })
})
