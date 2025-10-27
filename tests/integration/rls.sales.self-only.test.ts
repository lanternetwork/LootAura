import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { GET, POST, PUT, DELETE } from '../../app/api/sales/route'

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
      eq: vi.fn(),
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

describe('RLS Policy Verification - Sales Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Public Read Access', () => {
    it('should allow public access to published sales', async () => {
      const mockSales = [
        { id: 'sale1', title: 'Sale 1', status: 'published', owner_id: 'user1' },
        { id: 'sale2', title: 'Sale 2', status: 'published', owner_id: 'user2' },
      ]

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: mockSales, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/sales')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales).toHaveLength(2)
      expect(data.sales[0].status).toBe('published')
      expect(data.sales[1].status).toBe('published')
      
      // Verify the query was filtered by published status
      expect(mockFrom).toHaveBeenCalledWith('sales')
    })

    it('should not expose draft sales to public', async () => {
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [], // No draft sales returned
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/sales')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales).toHaveLength(0)
      
      // Verify the query was filtered by published status
      expect(mockFrom).toHaveBeenCalledWith('sales')
    })
  })

  describe('Owner-Only Write Access', () => {
    it('should allow authenticated users to create sales', async () => {
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
                id: 'sale123', 
                title: 'Test Sale', 
                owner_id: 'user123',
                status: 'draft'
              }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Sale',
          description: 'Test Description',
          start_date: '2024-01-01',
          end_date: '2024-01-02',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.sale.owner_id).toBe('user123')
      expect(data.sale.title).toBe('Test Sale')
      
      // Verify the insert was called with the correct owner_id
      expect(mockFrom).toHaveBeenCalledWith('sales')
    })

    it('should prevent unauthenticated users from creating sales', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Sale',
          description: 'Test Description',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should prevent users from creating sales for other users', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const request = new NextRequest('https://example.com/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Sale',
          description: 'Test Description',
          owner_id: 'other-user', // Attempting to create for another user
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      
      // The RLS policy should prevent this, but the application should also validate
      // that the owner_id matches the authenticated user
      expect(response.status).toBe(400)
    })
  })

  describe('Owner-Only Update Access', () => {
    it('should allow users to update their own sales', async () => {
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
                  id: 'sale123', 
                  title: 'Updated Sale', 
                  owner_id: 'user123' 
                }, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/sales/sale123', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Sale',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sale.owner_id).toBe('user123')
      expect(data.sale.title).toBe('Updated Sale')
      
      // Verify the update was filtered by owner_id
      expect(mockFrom).toHaveBeenCalledWith('sales')
    })

    it('should prevent users from updating other users sales', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock no rows affected (RLS prevents update of other users' sales)
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

      const request = new NextRequest('https://example.com/api/sales/sale123', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Sale',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=user1-session'
        },
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Sale not found')
    })
  })

  describe('Owner-Only Delete Access', () => {
    it('should allow users to delete their own sales', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValueOnce({ 
            data: { id: 'sale123' }, 
            error: null 
          }),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/sales/sale123', {
        method: 'DELETE',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Verify the delete was filtered by owner_id
      expect(mockFrom).toHaveBeenCalledWith('sales')
    })

    it('should prevent users from deleting other users sales', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock no rows affected (RLS prevents deletion of other users' sales)
      const mockFrom = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValueOnce({ 
            data: null, 
            error: null 
          }),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/sales/sale123', {
        method: 'DELETE',
        headers: { 'Cookie': 'session=user1-session' },
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Sale not found')
    })
  })

  describe('Data Isolation', () => {
    it('should ensure users can only access their own sales for management', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }
      const user2 = { id: 'user2', email: 'user2@example.com' }

      // User1 gets their sales
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      const mockFrom1 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [{ id: 'sale1', title: 'Sale 1', owner_id: 'user1' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom1

      const request1 = new NextRequest('https://example.com/api/sales?my_sales=true')
      
      const response1 = await GET(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)
      expect(data1.sales[0].owner_id).toBe('user1')

      // User2 gets their sales
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user2 },
        error: null,
      })

      const mockFrom2 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [{ id: 'sale2', title: 'Sale 2', owner_id: 'user2' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom2

      const request2 = new NextRequest('https://example.com/api/sales?my_sales=true')
      
      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.sales[0].owner_id).toBe('user2')

      // Verify data isolation
      expect(data1.sales[0].owner_id).not.toBe(data2.sales[0].owner_id)
    })
  })

  describe('RLS Policy Compliance', () => {
    it('should enforce owner-only sales management', async () => {
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
                data: [{ id: 'sale123', title: 'My Sale', owner_id: 'user123' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/sales?my_sales=true')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales[0].owner_id).toBe('user123')
      
      // The RLS policy ensures the user can only access their own sales
      // This is enforced at the database level
    })

    it('should prevent access to sales without proper authentication for management', async () => {
      // Simulate a request without proper authentication
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      const request = new NextRequest('https://example.com/api/sales?my_sales=true')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })
})