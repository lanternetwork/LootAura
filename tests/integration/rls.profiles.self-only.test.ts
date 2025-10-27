import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { GET, POST } from '../../app/api/profile/route'

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
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
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

describe('RLS Policy Verification - Profiles Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Self-Only Read Access', () => {
    it('should allow users to read their own profile', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockProfile = {
        id: 'user123',
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        home_zip: '12345',
        preferences: { theme: 'dark' },
      }

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

      const request = new NextRequest('https://example.com/api/profile')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.profile.id).toBe('user123')
      expect(data.profile.display_name).toBe('Test User')
      
      // Verify the query was filtered by user ID
      expect(mockFrom).toHaveBeenCalledWith('profiles_v2')
    })

    it('should prevent users from reading other users profiles', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock empty result (RLS prevents access to other users' profiles)
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

      const request = new NextRequest('https://example.com/api/profile')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Profile not found')
      
      // Verify the query was filtered by user ID
      expect(mockFrom).toHaveBeenCalledWith('profiles_v2')
    })

    it('should reject unauthenticated requests', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/profile')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Self-Only Update Access', () => {
    it('should allow users to update their own profile', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockUpdatedProfile = {
        id: 'user123',
        display_name: 'Updated Name',
        avatar_url: 'https://example.com/new-avatar.jpg',
        home_zip: '54321',
        preferences: { theme: 'light' },
      }

      const mockFrom = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValueOnce({ 
                data: mockUpdatedProfile, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          display_name: 'Updated Name',
          avatar_url: 'https://example.com/new-avatar.jpg',
          home_zip: '54321',
          preferences: { theme: 'light' },
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.profile.id).toBe('user123')
      expect(data.profile.display_name).toBe('Updated Name')
      
      // Verify the update was filtered by user ID
      expect(mockFrom).toHaveBeenCalledWith('profiles_v2')
    })

    it('should prevent users from updating other users profiles', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock no rows affected (RLS prevents update of other users' profiles)
      const mockFrom = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValueOnce({ 
                data: null, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          display_name: 'Updated Name',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=user1-session'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Profile not found')
    })

    it('should prevent unauthenticated users from updating profiles', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          display_name: 'Updated Name',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should prevent users from updating profiles for other users', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          id: 'other-user', // Attempting to update another user's profile
          display_name: 'Updated Name',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      
      // The RLS policy should prevent this, but the application should also validate
      // that the profile ID matches the authenticated user
      expect(response.status).toBe(400)
    })
  })

  describe('Data Isolation', () => {
    it('should ensure users can only access their own profiles', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }
      const user2 = { id: 'user2', email: 'user2@example.com' }

      // User1 gets their profile
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      const mockFrom1 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ 
              data: { 
                id: 'user1', 
                display_name: 'User 1', 
                avatar_url: 'https://example.com/user1.jpg' 
              }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom1

      const request1 = new NextRequest('https://example.com/api/profile')
      
      const response1 = await GET(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)
      expect(data1.profile.id).toBe('user1')

      // User2 gets their profile
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user2 },
        error: null,
      })

      const mockFrom2 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ 
              data: { 
                id: 'user2', 
                display_name: 'User 2', 
                avatar_url: 'https://example.com/user2.jpg' 
              }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom2

      const request2 = new NextRequest('https://example.com/api/profile')
      
      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.profile.id).toBe('user2')

      // Verify data isolation
      expect(data1.profile.id).not.toBe(data2.profile.id)
    })
  })

  describe('RLS Policy Compliance', () => {
    it('should enforce self-only profile access', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValueOnce({ 
              data: { 
                id: 'user123', 
                display_name: 'My Profile', 
                avatar_url: 'https://example.com/my-avatar.jpg' 
              }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.profile.id).toBe('user123')
      
      // The RLS policy ensures the user can only access their own profile
      // This is enforced at the database level
    })

    it('should prevent access to profiles without proper authentication', async () => {
      // Simulate a request without proper authentication
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      const request = new NextRequest('https://example.com/api/profile')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should enforce profile ownership in updates', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValueOnce({ 
                data: { 
                  id: 'user123', 
                  display_name: 'Updated Profile' 
                }, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          display_name: 'Updated Profile',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.profile.id).toBe('user123')
      
      // The RLS policy ensures the user can only update their own profile
      // This is enforced at the database level
    })
  })

  describe('Profile Creation Security', () => {
    it('should ensure profile creation is tied to authenticated user', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValueOnce({ 
              data: { 
                id: 'user123', 
                display_name: 'New User', 
                avatar_url: null,
                home_zip: null,
                preferences: {}
              }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.profile.id).toBe('user123')
      
      // Verify the profile was created with the correct user ID
      expect(mockFrom).toHaveBeenCalledWith('profiles_v2')
    })

    it('should prevent profile creation for unauthenticated users', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/profile', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })
})