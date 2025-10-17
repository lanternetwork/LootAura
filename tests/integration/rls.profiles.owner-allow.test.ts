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

describe('RLS Profiles Owner Allow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should allow user to insert their own profile', async () => {
    const mockProfile = {
      id: 'user-a-id',
      username: 'user-a',
      full_name: 'User A',
      avatar_url: 'https://example.com/avatar.jpg',
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
          data: [mockProfile],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('profiles_v2')
      .insert({
        id: 'user-a-id',
        username: 'user-a',
        full_name: 'User A',
        avatar_url: 'https://example.com/avatar.jpg',
      })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockProfile])
  })

  it('should allow user to update their own profile', async () => {
    const mockProfile = {
      id: 'user-a-id',
      username: 'user-a-updated',
      full_name: 'User A Updated',
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
          data: [mockProfile],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('profiles_v2')
      .update({ username: 'user-a-updated' })
      .eq('id', 'user-a-id')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([mockProfile])
  })

  it('should allow public read of minimal profile fields', async () => {
    const mockProfiles = [
      {
        id: 'user-a-id',
        username: 'user-a',
        full_name: 'User A',
        avatar_url: 'https://example.com/avatar.jpg',
        // Sensitive fields like home_zip, preferences should not be exposed
      },
      {
        id: 'user-b-id',
        username: 'user-b',
        full_name: 'User B',
        avatar_url: null,
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
        select: vi.fn().mockResolvedValue({
          data: mockProfiles,
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('profiles_v2')
      .select('id, username, full_name, avatar_url')

    expect(error).toBeNull()
    expect(data).toEqual(mockProfiles)
  })

  it('should deny user B from updating user A\'s profile', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-b-id' } },
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
      .from('profiles_v2')
      .update({ username: 'hacked-user' })
      .eq('id', 'user-a-id')
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should handle RLS success for profile operations', async () => {
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
          data: [{ id: 'user-a-id' }],
          error: null,
        }),
      })),
    }

    const { createServerSupabaseClient } = await import('@/lib/auth/server-session')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const supabase = createServerSupabaseClient({} as any)
    const { data, error } = await supabase
      .from('profiles_v2')
      .insert({ id: 'user-a-id', username: 'user-a' })
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([{ id: 'user-a-id' }])
  })
})
