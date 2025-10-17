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

describe('RLS Sales Non-Owner Denial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should deny user B from updating user A\'s sale', async () => {
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
      .from('sales_v2')
      .update({ title: 'Hacked Sale' })
      .eq('id', 'user-a-sale-id')
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
    expect(mockSupabase.from).toHaveBeenCalledWith('sales_v2')
  })

  it('should deny user B from deleting user A\'s sale', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-b-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
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
      .from('sales_v2')
      .delete()
      .eq('id', 'user-a-sale-id')
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should deny user B from inserting items into user A\'s sale', async () => {
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
      .from('items_v2')
      .insert({
        sale_id: 'user-a-sale-id',
        name: 'Hacked Item',
        price: 100,
      })
      .select()

    expect(error).toBeDefined()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('should log RLS denial for debugging', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
    await supabase
      .from('sales_v2')
      .update({ title: 'Hacked Sale' })
      .eq('id', 'user-a-sale-id')
      .select()

    // Should log the RLS denial
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RLS]'),
      expect.objectContaining({
        event: 'rls-test',
        table: 'sales',
        action: 'update',
        allowed: false,
      })
    )

    consoleSpy.mockRestore()
  })
})
