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
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => mockSupabaseClient),
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

      // Mock profile doesn't exist
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValueOnce({ data: mockNewProfile, error: null }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.created).toBe(true)
      expect(data.profile).toEqual(mockNewProfile)
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

      // Mock profile exists
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ 
              data: mockExistingProfile, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.created).toBe(false)
      expect(data.profile).toEqual(mockExistingProfile)
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

      // Mock profile doesn't exist but creation fails
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValueOnce({ 
              data: null, 
              error: { message: 'Database error' } 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
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

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValueOnce({ 
              data: { id: 'user123' }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        headers: { 'Cookie': 'session=valid' },
      })

      await POST(request)

      expect(consoleSpy).toHaveBeenCalledWith(
        '🔄 [AUTH FLOW] profile-creation → start: start',
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

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ 
              data: null, 
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

      expect(response.status).toBe(404)
      expect(data.error).toBe('Profile not found')
    })
  })
})
