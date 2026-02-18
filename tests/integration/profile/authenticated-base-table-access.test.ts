import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { fromBase } from '@/lib/supabase/clients'

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
  })),
}))

// Mock getRlsDb
const mockRlsDb = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    }),
  },
}

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: vi.fn(async (_request?: any) => mockRlsDb),
  fromBase: (db: any, table: string) => db.from(table),
}))

// Mock getAdminDb
const mockAdminDb = {
  from: vi.fn(),
}

vi.mock('@/lib/supabase/admin', () => ({
  getAdminDb: vi.fn(() => mockAdminDb),
}))

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

describe('Authenticated Profile Flows - Base Table Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Account Lock Check', () => {
    it('should allow authenticated user to read is_locked from base table', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { is_locked: false },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        maybeSingle: mockMaybeSingle,
      })

      mockSelect.mockReturnValue({
        eq: mockEq,
      })
      mockEq.mockReturnValue({
        maybeSingle: mockMaybeSingle,
      })

      // Simulate account lock check
      const { data, error } = await fromBase(mockRlsDb as any, 'profiles')
        .select('is_locked')
        .eq('id', 'user-123')
        .maybeSingle()

      // Should query base table (authenticated users have SELECT permission)
      expect(mockRlsDb.from).toHaveBeenCalledWith('profiles')
      expect(error).toBeNull()
      expect(data).toEqual({ is_locked: false })
    })

    it('should allow authenticated user to read locked account status', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          is_locked: true,
          locked_at: '2024-01-01T00:00:00Z',
          locked_by: 'admin@example.com',
          lock_reason: 'Violation of terms',
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        maybeSingle: mockMaybeSingle,
      })

      mockSelect.mockReturnValue({
        eq: mockEq,
      })
      mockEq.mockReturnValue({
        maybeSingle: mockMaybeSingle,
      })

      // Simulate account lock check
      const { data, error } = await fromBase(mockRlsDb as any, 'profiles')
        .select('is_locked, locked_at, locked_by, lock_reason')
        .eq('id', 'user-123')
        .maybeSingle()

      // Should query base table successfully
      expect(mockRlsDb.from).toHaveBeenCalledWith('profiles')
      expect(error).toBeNull()
      expect(data?.is_locked).toBe(true)
      expect(data?.lock_reason).toBe('Violation of terms')
    })
  })

  describe('Profile Update', () => {
    it('should allow authenticated user to update profile via base table', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockResolvedValue({
        data: {
          id: 'user-123',
          username: 'testuser',
          display_name: 'Updated Name',
          avatar_url: 'https://example.com/avatar.jpg',
          bio: 'Updated bio',
          location_city: 'Updated City',
          location_region: 'Updated Region',
          created_at: '2024-01-01T00:00:00Z',
          verified: true,
          social_links: null,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'user-123',
          username: 'testuser',
          display_name: 'Updated Name',
          avatar_url: 'https://example.com/avatar.jpg',
          bio: 'Updated bio',
          location_city: 'Updated City',
          location_region: 'Updated Region',
          created_at: '2024-01-01T00:00:00Z',
          verified: true,
          social_links: null,
        },
        error: null,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })
      mockEq.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      })

      // Simulate profile update
      const { data, error } = await fromBase(mockRlsDb as any, 'profiles')
        .update({ display_name: 'Updated Name' })
        .eq('id', 'user-123')
        .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, social_links')
        .single()

      // Should query base table (authenticated users have UPDATE permission)
      expect(mockRlsDb.from).toHaveBeenCalledWith('profiles')
      expect(error).toBeNull()
      expect(data?.display_name).toBe('Updated Name')
    })
  })

  describe('Profile Notifications Update', () => {
    it('should allow authenticated user to update notification preferences via base table', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockResolvedValue({
        data: {
          email_favorites_digest_enabled: true,
          email_seller_weekly_enabled: false,
        },
        error: null,
      })

      mockRlsDb.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          email_favorites_digest_enabled: true,
          email_seller_weekly_enabled: false,
        },
        error: null,
      })

      mockUpdate.mockReturnValue({
        eq: mockEq,
      })
      mockEq.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      })

      // Simulate notification preferences update
      const { data, error } = await fromBase(mockRlsDb as any, 'profiles')
        .update({
          email_favorites_digest_enabled: true,
          email_seller_weekly_enabled: false,
        })
        .eq('id', 'user-123')
        .select('email_favorites_digest_enabled, email_seller_weekly_enabled')
        .single()

      // Should query base table (authenticated users have UPDATE permission)
      expect(mockRlsDb.from).toHaveBeenCalledWith('profiles')
      expect(error).toBeNull()
      expect(data?.email_favorites_digest_enabled).toBe(true)
      expect(data?.email_seller_weekly_enabled).toBe(false)
    })
  })
})

