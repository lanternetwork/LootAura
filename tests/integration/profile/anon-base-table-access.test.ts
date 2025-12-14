import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
  })),
}))

// Mock createSupabaseServerClient
const mockFrom = vi.fn()
const mockSupabaseClient = {
  from: mockFrom,
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => mockSupabaseClient),
}))

// Mock deriveCategories
vi.mock('@/lib/profile/deriveCategories', () => ({
  deriveCategories: vi.fn().mockResolvedValue([]),
}))

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

describe('Public Profile Endpoint - Anon Base Table Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    })
  })

  describe('GET /api/public/profile', () => {
    it('should return profile from profiles_v2 view (not base table)', async () => {
      const mockProfile = {
        id: 'user-123',
        username: 'testuser',
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        bio: 'Test bio',
        location_city: 'Test City',
        location_region: 'Test Region',
        created_at: '2024-01-01T00:00:00Z',
        verified: true,
      }

      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: mockProfile,
        error: null,
      })

      mockFrom.mockReturnValue({
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

      const { GET } = await import('@/app/api/public/profile/route')
      const request = new NextRequest('http://localhost/api/public/profile?username=testuser', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      // Should query profiles_v2 view
      expect(mockFrom).toHaveBeenCalledWith('profiles_v2')
      expect(mockFrom).not.toHaveBeenCalledWith('profiles')

      // Should return expected public fields
      expect(response.status).toBe(200)
      expect(data.profile).toEqual(mockProfile)
      expect(data.profile).not.toHaveProperty('is_locked')
      expect(data.profile).not.toHaveProperty('locked_at')
      expect(data.profile).not.toHaveProperty('locked_by')
      expect(data.profile).not.toHaveProperty('lock_reason')
      expect(data.profile).not.toHaveProperty('email_favorites_digest_enabled')
      expect(data.profile).not.toHaveProperty('email_seller_weekly_enabled')
    })

    it('should return 404 for missing profile (no base table fallback)', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })

      mockFrom.mockReturnValue({
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

      const { GET } = await import('@/app/api/public/profile/route')
      const request = new NextRequest('http://localhost/api/public/profile?username=nonexistent', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      // Should only query profiles_v2 view, never base table
      expect(mockFrom).toHaveBeenCalledWith('profiles_v2')
      expect(mockFrom).not.toHaveBeenCalledWith('profiles')

      // Should return 404
      expect(response.status).toBe(404)
      expect(data.error).toBe('not found')
    })

    it('should try username first, then id, but never base table', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockMaybeSingle = vi.fn()
        .mockResolvedValueOnce({ data: null, error: null }) // username query
        .mockResolvedValueOnce({ data: null, error: null }) // id query

      mockFrom.mockReturnValue({
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

      const { GET } = await import('@/app/api/public/profile/route')
      const request = new NextRequest('http://localhost/api/public/profile?username=testuser', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      // Should query profiles_v2 twice (username, then id), but never base table
      expect(mockFrom).toHaveBeenCalledTimes(2)
      expect(mockFrom).toHaveBeenCalledWith('profiles_v2')
      expect(mockFrom).not.toHaveBeenCalledWith('profiles')

      // Should return 404
      expect(response.status).toBe(404)
      expect(data.error).toBe('not found')
    })
  })
})

