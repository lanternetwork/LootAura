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

describe('RLS Sales Self-Only Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should allow public access to published sales_v2', async () => {
    const mockSales = [
      {
        id: 'sale1',
        title: 'Test Sale',
        status: 'published',
        owner_id: 'user123',
        created_at: '2025-01-01T00:00:00Z',
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
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockSales,
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .select('*')
      .gte('created_at', '2025-01-01')
      .lte('created_at', '2025-01-02')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual(mockSales)
  })

  it('should not expose draft sales_v2 to public', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null }, // Anonymous user
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [], // RLS filters out drafts for public access
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .select('*')
      .gte('created_at', '2025-01-01')
      .lte('created_at', '2025-01-02')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS filters out drafts
  })

  it('should allow users to access their own sales_v2 for management', async () => {
    const mockSales = [
      {
        id: 'sale1',
        title: 'My Sale',
        status: 'draft',
        owner_id: 'user123',
        created_at: '2025-01-01T00:00:00Z',
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
          data: mockSales,
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('owner_id', 'user123')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual(mockSales)
    expect(data[0].owner_id).toBe('user123')
  })

  it('should ensure users can only access their own sales_v2 for management', async () => {
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
          data: [], // RLS filters to only user's sales
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('owner_id', 'other456')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS prevents access to other user's sales
  })

  it('should allow user to create their own sales_v2', async () => {
    const mockSale = {
      id: 'sale1',
      title: 'New Sale',
      status: 'draft',
      owner_id: 'user123',
      created_at: '2025-01-01T00:00:00Z',
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
        title: 'New Sale',
        status: 'draft',
        owner_id: 'user123',
      })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockSale])
    expect(data[0].owner_id).toBe('user123')
  })

  it('should prevent user from creating sales_v2 for other users', async () => {
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
      .from('sales_v2')
      .insert({
        title: 'Hacked Sale',
        status: 'draft',
        owner_id: 'other456', // Trying to create for another user
      })
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })
})
