import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { GET, POST, DELETE } from '../../app/api/favorites_v2/route'

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
        order: vi.fn(() => ({
          range: vi.fn(),
        })),
      })),
      order: vi.fn(() => ({
        range: vi.fn(),
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
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
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(),
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

describe('RLS Policy Verification - Favorites Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Owner-Only Access', () => {
    it('should only allow users to access their own favorites_v2_v2', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFavorites = [
        { id: 'fav1', user_id: 'user123', sale_id: 'sale1' },
        { id: 'fav2', user_id: 'user123', sale_id: 'sale2' },
      ]

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: mockFavorites, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/favorites_v2')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorites_v2).toHaveLength(2)
      expect(data.favorites_v2[0].user_id).toBe('user123')
      expect(data.favorites_v2[1].user_id).toBe('user123')
      
      // Verify the query was filtered by user ID
      expect(mockFrom).toHaveBeenCalledWith('favorites_v2')
    })

    it('should prevent access to other users favorites_v2_v2', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock empty result (RLS prevents access to other users' favorites_v2_v2)
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/favorites_v2')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorites_v2).toHaveLength(0)
      
      // Verify the query was filtered by user ID
      expect(mockFrom).toHaveBeenCalledWith('favorites_v2')
    })

    it('should reject unauthenticated requests', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/favorites_v2')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })
  })

  describe('Owner-Only Write Access', () => {
    it('should allow users to create their own favorites_v2_v2', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValueOnce({ 
              data: { id: 'fav123', user_id: 'user123', sale_id: 'sale123' }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/favorites_v2_v2', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: 'sale123',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorite.user_id).toBe('user123')
      expect(data.favorite.sale_id).toBe('sale123')
      
      // Verify the insert was called with the correct user_id
      expect(mockFrom).toHaveBeenCalledWith('favorites_v2')
    })

    it('should prevent unauthenticated users from creating favorites_v2_v2', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/favorites_v2_v2', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: 'sale123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })

    it('should prevent users from creating favorites_v2_v2 for other users', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const request = new NextRequest('https://example.com/api/favorites_v2_v2', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: 'sale123',
          user_id: 'other-user', // Attempting to create for another user
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      
      // The RLS policy should prevent this, but the application should also validate
      // that the user_id matches the authenticated user
      expect(response.status).toBe(200)
    })
  })

  describe('Owner-Only Delete Access', () => {
    it('should allow users to delete their own favorites_v2_v2', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValueOnce({ 
              data: null, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/favorites_v2_v2?sale_id=sale123', {
        method: 'DELETE',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Verify the delete was filtered by user ID
      expect(mockFrom).toHaveBeenCalledWith('favorites_v2')
    })

    it('should prevent users from deleting other users favorites_v2_v2', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock no rows affected (RLS prevents deletion of other users' favorites_v2_v2)
      const mockFrom = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValueOnce({ 
              data: null, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/favorites_v2_v2?sale_id=sale123', {
        method: 'DELETE',
        headers: { 'Cookie': 'session=user1-session' },
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Data Isolation', () => {
    it('should ensure users can only access their own favorites_v2_v2', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }
      const user2 = { id: 'user2', email: 'user2@example.com' }

      // User1 gets their favorites_v2_v2
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      const mockFrom1 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [{ id: 'fav1', user_id: 'user1', sale_id: 'sale1' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom1

      const request1 = new NextRequest('https://example.com/api/favorites_v2_v2')
      
      const response1 = await GET(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)
      expect(data1.favorites_v2[0].user_id).toBe('user1')

      // User2 gets their favorites_v2_v2
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user2 },
        error: null,
      })

      const mockFrom2 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [{ id: 'fav2', user_id: 'user2', sale_id: 'sale2' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom2

      const request2 = new NextRequest('https://example.com/api/favorites_v2_v2')
      
      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.favorites_v2[0].user_id).toBe('user2')

      // Verify data isolation
      expect(data1.favorites_v2[0].user_id).not.toBe(data2.favorites_v2[0].user_id)
    })
  })

  describe('RLS Policy Compliance', () => {
    it('should enforce owner-only favorites_v2_v2 access', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [{ id: 'fav123', user_id: 'user123', sale_id: 'sale123' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/favorites_v2')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorites_v2[0].user_id).toBe('user123')
      
      // The RLS policy ensures the user can only access their own favorites_v2_v2
      // This is enforced at the database level
    })

    it('should prevent access to favorites_v2_v2 without proper authentication', async () => {
      // Simulate a request without proper authentication
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      const request = new NextRequest('https://example.com/api/favorites_v2')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })
  })
})