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

describe('RLS Favorites Owner Allow/Deny', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should allow user to add their own favorites', async () => {
    const mockFavorite = {
      user_id: 'user-a-id',
      sale_id: 'sale-1',
      created_at: '2025-10-17T00:00:00Z',
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
        user_id: 'user-a-id',
        sale_id: 'sale-1',
      })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockFavorite])
  })

  it('should allow user to read their own favorites', async () => {
    const mockFavorites = [
      {
        user_id: 'user-a-id',
        sale_id: 'sale-1',
        created_at: '2025-10-17T00:00:00Z',
      },
      {
        user_id: 'user-a-id',
        sale_id: 'sale-2',
        created_at: '2025-10-17T01:00:00Z',
      },
    ]

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-a-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
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

    expect(error).toBeNull()
    expect(data).toEqual(mockFavorites)
  })

  it('should allow user to delete their own favorites', async () => {
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
          data: [{ user_id: 'user-a-id', sale_id: 'sale-1' }],
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
      .eq('sale_id', 'sale-1')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([{ user_id: 'user-a-id', sale_id: 'sale-1' }])
  })

  it('should deny user B from reading user A\'s favorites', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-b-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [], // Empty result due to RLS
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

    expect(error).toBeNull()
    expect(data).toEqual([]) // No favorites returned due to RLS
  })

  it('should deny user B from adding favorites for user A', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-b-id' } },
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
        user_id: 'user-a-id', // Trying to add for user A
        sale_id: 'sale-1',
      })
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should deny anonymous users from accessing favorites', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [], // Empty result due to RLS
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

    expect(error).toBeNull()
    expect(data).toEqual([]) // No favorites returned due to RLS
  })

  it('should log RLS success for favorites operations', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
          data: [{ user_id: 'user-a-id', sale_id: 'sale-1' }],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    await supabase
      .from('favorites_v2')
      .insert({ user_id: 'user-a-id', sale_id: 'sale-1' })
      .select()

    // Should log the RLS success
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RLS]'),
      expect.objectContaining({
        event: 'rls-test',
        table: 'favorites',
        action: 'insert',
        allowed: true,
      })
    )

    consoleSpy.mockRestore()
  })
})
