import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/profile/route'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(),
        single: vi.fn(),
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(),
      })),
    })),
  })),
  rpc: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => mockSupabaseClient),
}))

const mockEnsure = vi.fn()
const mockFetchV2 = vi.fn()

vi.mock('@/lib/profile/ensureLootauraProfile', () => ({
  ensureLootauraProfileExists: (...args: unknown[]) => mockEnsure(...args),
}))

vi.mock('@/lib/profile/fetchProfileV2', () => ({
  fetchProfileV2: (...args: unknown[]) => mockFetchV2(...args),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

describe('Profile Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_DEBUG
    mockSupabaseClient.rpc = vi.fn()
    mockEnsure.mockResolvedValue({ ok: true, created: true, userId: 'user123' })
    mockFetchV2.mockResolvedValue(null)
  })

  describe('POST /api/profile', () => {
    it('should create new profile for authenticated user', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        user_metadata: { full_name: 'Test User' },
      }
      
      const mockNewProfile = {
        id: 'user123',
        display_name: 'Test User',
        avatar_url: null,
        home_zip: null,
        preferences: {
          notifications: { email: true, push: false },
          privacy: { show_email: false, show_phone: false },
        },
      }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      })

      mockEnsure.mockResolvedValueOnce({ ok: true, created: true, userId: 'user123' })
      mockFetchV2.mockResolvedValueOnce(mockNewProfile)

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.created).toBe(true)
      expect(data.data).toEqual(mockNewProfile)
      expect(data.message).toBe('Profile created successfully')
    })

    it('should return existing profile without creating duplicate', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
      }
      
      const mockExistingProfile = {
        id: 'user123',
        display_name: 'Existing User',
        avatar_url: null,
        home_zip: '12345',
        preferences: { notifications: { email: true } },
      }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      })

      mockEnsure.mockResolvedValueOnce({ ok: true, created: false, userId: 'user123' })
      mockFetchV2.mockResolvedValueOnce(mockExistingProfile)

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.created).toBe(false)
      expect(data.data).toEqual(mockExistingProfile)
      expect(data.message).toBe('Profile already exists')
    })

    it('should handle unauthenticated requests', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })

    it('should handle profile creation errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
      }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      })

      mockEnsure.mockResolvedValueOnce({
        ok: false,
        created: false,
        errorCode: 'db_error',
      })

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Failed to create profile')
      
      consoleSpy.mockRestore()
    })

    it('should log debug information when enabled', async () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
      }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      })

      mockEnsure.mockResolvedValueOnce({ ok: true, created: true, userId: 'user123' })
      mockFetchV2.mockResolvedValueOnce({ id: 'user123' })

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      await POST(request)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[PROFILE] POST ensure start',
        expect.objectContaining({
          userId: 'user123',
        })
      )

      consoleSpy.mockRestore()
    })
  })

  describe('GET /api/profile', () => {
    it('should return user profile for authenticated user', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
      }
      
      const mockProfile = {
        id: 'user123',
        display_name: 'Test User',
        avatar_url: null,
        home_zip: '12345',
        preferences: { notifications: { email: true } },
      }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ 
              data: mockProfile, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'GET',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data).toEqual(mockProfile)
    })

    it('should return 404 when profile not found', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
      }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      })

      mockSupabaseClient.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: null,
              error: null,
            }),
          })),
        })),
      }))

      mockEnsure.mockResolvedValueOnce({ ok: false })

      // GET: get_profile RPC (view miss), then update_profile RPC (create failed)
      mockSupabaseClient.rpc
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'Profile not found' },
        })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'RPC failed' },
        })

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'GET',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Profile not found')
    })
  })
})
