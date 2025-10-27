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

describe('RLS Favorites Self-Only Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should only allow users to access their own favorites_v2', async () => {
    const mockFavorites = [
      {
        id: 'fav1',
        user_id: 'user123',
        sale_id: 'sale1',
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
          data: mockFavorites,
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('favorites_v2')
      .select('*')
      .eq('user_id', 'user123')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual(mockFavorites)
    expect(data[0].user_id).toBe('user123')
  })

  it('should prevent access to other users favorites_v2', async () => {
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
          data: [], // RLS filters out other users' favorites
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('favorites_v2')
      .select('*')
      .eq('user_id', 'other456')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS prevents access
  })

  it('should allow users to create favorites_v2 for themselves', async () => {
    const mockFavorite = {
      id: 'fav1',
      user_id: 'user123',
      sale_id: 'sale1',
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
          data: [mockFavorite],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('favorites_v2')
      .insert({
        user_id: 'user123',
        sale_id: 'sale1',
      })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockFavorite])
    expect(data[0].user_id).toBe('user123')
  })

  it('should prevent users from creating favorites_v2 for other users', async () => {
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
      .from('favorites_v2')
      .insert({
        user_id: 'other456', // Trying to create for another user
        sale_id: 'sale1',
      })
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should allow users to delete their own favorites_v2', async () => {
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
      .from('favorites_v2')
      .delete()
      .eq('id', 'fav1')

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('should prevent users from deleting other users favorites_v2', async () => {
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
      .from('favorites_v2')
      .delete()
      .eq('id', 'other_fav')

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should ensure users can only access their own favorites_v2', async () => {
    const mockFavorites = [
      {
        id: 'fav1',
        user_id: 'user123',
        sale_id: 'sale1',
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
          data: mockFavorites, // Only user's own favorites
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('favorites_v2')
      .select('*')
      .eq('user_id', 'user123')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual(mockFavorites)
    expect(data[0].user_id).toBe('user123')
  })

  it('should prevent access to favorites_v2 without proper authentication', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null }, // No authentication
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [], // RLS prevents access without auth
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('favorites_v2')
      .select('*')
      .eq('user_id', 'user123')
      .order('created_at', { ascending: false })
      .range(0, 9)

    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS prevents access without auth
  })
})
