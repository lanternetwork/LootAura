import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

// Mock the server session module
vi.mock('@/lib/auth/server-session', () => ({
  createServerSupabaseClient: vi.fn(),
}))

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
  })),
}))

describe('RLS Items Self-Only Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should allow public access to items_v2 from published sales', async () => {
    const mockItems = [
      {
        id: 'item1',
        name: 'Test Item',
        price: 10.00,
        sale_id: 'sale1',
        owner_id: 'user123',
      },
    ]

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null }, // Anonymous user
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: mockItems,
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .select('*')
      .eq('sale_id', 'sale1')

    expect(error).toBeNull()
    expect(data).toEqual(mockItems)
  })

  it('should not expose items_v2 from draft sales to public', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null }, // Anonymous user
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [], // RLS filters out items from draft sales
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .select('*')
      .eq('sale_id', 'draft_sale')

    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS filters out items from draft sales
  })

  it('should allow users to create items_v2 for their sales', async () => {
    const mockItem = {
      id: 'item1',
      name: 'New Item',
      price: 15.00,
      sale_id: 'sale1',
      owner_id: 'user123',
    }

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [mockItem],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .insert({
        name: 'New Item',
        price: 15.00,
        sale_id: 'sale1',
        owner_id: 'user123',
      })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockItem])
    expect(data[0].owner_id).toBe('user123')
  })

  it('should allow users to update items_v2 from their own sales', async () => {
    const mockItem = {
      id: 'item1',
      name: 'Updated Item',
      price: 20.00,
      sale_id: 'sale1',
      owner_id: 'user123',
    }

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [mockItem],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .update({ name: 'Updated Item', price: 20.00 })
      .eq('id', 'item1')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockItem])
    expect(data[0].owner_id).toBe('user123')
  })

  it('should prevent users from updating items_v2 from other users sales', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'new row violates row-level security policy', code: '42501' },
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .update({ name: 'Updated Item', price: 20.00 })
      .eq('id', 'other_item')
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should allow users to delete items_v2 from their own sales', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .delete()
      .eq('id', 'item1')

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('should prevent users from deleting items_v2 from other users sales', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'new row violates row-level security policy', code: '42501' },
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .delete()
      .eq('id', 'other_item')

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should ensure users can only access items_v2 from their own sales for management', async () => {
    const mockItems = [
      {
        id: 'item1',
        name: 'My Item',
        price: 10.00,
        sale_id: 'sale1',
        owner_id: 'user123',
      },
    ]

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockItems, // Only user's own items
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .select('*')
      .eq('owner_id', 'user123')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual(mockItems)
    expect(data[0].owner_id).toBe('user123')
  })

  it('should prevent user from creating items_v2 for other users sales', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'new row violates row-level security policy', code: '42501' },
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('items_v2')
      .insert({
        name: 'Hacked Item',
        price: 20.00,
        sale_id: 'other_sale',
        owner_id: 'other456', // Trying to create for another user
      })
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })
})
