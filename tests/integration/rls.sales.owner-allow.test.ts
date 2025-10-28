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

describe('RLS Sales Owner Allow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should allow user A to insert their own sale', async () => {
    const mockSale = {
      id: 'user-a-sale-id',
      owner_id: 'user-a-id',
      title: 'User A Sale',
      description: 'A great sale',
      status: 'published',
    }

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-a-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [mockSale],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .insert({
        title: 'User A Sale',
        description: 'A great sale',
        owner_id: 'user-a-id',
      })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockSale])
  })

  it('should allow user A to update their own sale', async () => {
    const mockSale = {
      id: 'user-a-sale-id',
      owner_id: 'user-a-id',
      title: 'Updated Sale',
      description: 'Updated description',
    }

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-a-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [mockSale],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .update({ title: 'Updated Sale' })
      .eq('id', 'user-a-sale-id')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockSale])
  })

  it('should allow user A to delete their own sale', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-a-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'user-a-sale-id' }],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .delete()
      .eq('id', 'user-a-sale-id')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([{ id: 'user-a-sale-id' }])
  })

  it('should allow user A to insert items into their own sale', async () => {
    const mockItem = {
      id: 'item-id',
      sale_id: 'user-a-sale-id',
      name: 'User A Item',
      price: 50,
    }

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-a-id' } },
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
        sale_id: 'user-a-sale-id',
        name: 'User A Item',
        price: 50,
      })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockItem])
  })

  it('should handle RLS success gracefully', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-a-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'user-a-sale-id' }],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .insert({ title: 'User A Sale', owner_id: 'user-a-id' })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([{ id: 'user-a-sale-id' }])
  })
})
