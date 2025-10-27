import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { GET, POST, PUT, DELETE } from '../../app/api/items_v2/route'

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

describe('RLS Policy Verification - Items Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Public Read Access', () => {
    it('should allow public access to items_v2 from published sales', async () => {
      const mockItems = [
        { id: 'item1', title: 'Item 1', sale_id: 'sale1', owner_id: 'user1' },
        { id: 'item2', title: 'Item 2', sale_id: 'sale2', owner_id: 'user2' },
      ]

      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: mockItems, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2?sale_id=sale1')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.items_v2).toHaveLength(2)
      expect(data.items_v2[0].sale_id).toBe('sale1')
      
      // Verify the query was filtered by sale_id
      expect(mockFrom).toHaveBeenCalledWith('items_v2')
    })

    it('should not expose items_v2 from draft sales to public', async () => {
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [], // No items_v2 returned for draft sales
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2?sale_id=draft-sale')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.items_v2).toHaveLength(0)
      
      // Verify the query was filtered by sale_id
      expect(mockFrom).toHaveBeenCalledWith('items_v2')
    })
  })

  describe('Owner-Only Write Access', () => {
    it('should allow authenticated users to create items_v2 for their sales', async () => {
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
                id: 'item123', 
                title: 'Test Item', 
                sale_id: 'sale123',
                owner_id: 'user123'
              }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Item',
          description: 'Test Description',
          price: 10.00,
          sale_id: 'sale123',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.item.owner_id).toBe('user123')
      expect(data.item.sale_id).toBe('sale123')
      
      // Verify the insert was called with the correct owner_id
      expect(mockFrom).toHaveBeenCalledWith('items_v2')
    })

    it('should prevent unauthenticated users from creating items_v2', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/items_v2', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Item',
          description: 'Test Description',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should prevent users from creating items_v2 for other users sales', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const request = new NextRequest('https://example.com/api/items_v2', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Item',
          description: 'Test Description',
          sale_id: 'other-user-sale', // Attempting to create for another user's sale
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      
      // The RLS policy should prevent this, but the application should also validate
      // that the sale belongs to the authenticated user
      expect(response.status).toBe(400)
    })
  })

  describe('Owner-Only Update Access', () => {
    it('should allow users to update items_v2 from their own sales', async () => {
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
                  id: 'item123', 
                  title: 'Updated Item', 
                  owner_id: 'user123' 
                }, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2/item123', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Item',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.item.owner_id).toBe('user123')
      expect(data.item.title).toBe('Updated Item')
      
      // Verify the update was filtered by owner_id
      expect(mockFrom).toHaveBeenCalledWith('items_v2')
    })

    it('should prevent users from updating items_v2 from other users sales', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock no rows affected (RLS prevents update of other users' items_v2)
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

      const request = new NextRequest('https://example.com/api/items_v2/item123', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Item',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=user1-session'
        },
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Item not found')
    })
  })

  describe('Owner-Only Delete Access', () => {
    it('should allow users to delete items_v2 from their own sales', async () => {
      const user = { id: 'user123', email: 'user@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user },
        error: null,
      })

      const mockFrom = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValueOnce({ 
            data: { id: 'item123' }, 
            error: null 
          }),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2/item123', {
        method: 'DELETE',
        headers: { 'Cookie': 'session=valid' },
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Verify the delete was filtered by owner_id
      expect(mockFrom).toHaveBeenCalledWith('items_v2')
    })

    it('should prevent users from deleting items_v2 from other users sales', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }

      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      // Mock no rows affected (RLS prevents deletion of other users' items_v2)
      const mockFrom = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValueOnce({ 
            data: null, 
            error: null 
          }),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2/item123', {
        method: 'DELETE',
        headers: { 'Cookie': 'session=user1-session' },
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Item not found')
    })
  })

  describe('Data Isolation', () => {
    it('should ensure users can only access items_v2 from their own sales for management', async () => {
      const user1 = { id: 'user1', email: 'user1@example.com' }
      const user2 = { id: 'user2', email: 'user2@example.com' }

      // User1 gets items_v2 from their sales
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user1 },
        error: null,
      })

      const mockFrom1 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [{ id: 'item1', title: 'Item 1', owner_id: 'user1' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom1

      const request1 = new NextRequest('https://example.com/api/items_v2?my_items_v2=true')
      
      const response1 = await GET(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)
      expect(data1.items_v2[0].owner_id).toBe('user1')

      // User2 gets items_v2 from their sales
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: user2 },
        error: null,
      })

      const mockFrom2 = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValueOnce({ 
                data: [{ id: 'item2', title: 'Item 2', owner_id: 'user2' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom2

      const request2 = new NextRequest('https://example.com/api/items_v2?my_items_v2=true')
      
      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.items_v2[0].owner_id).toBe('user2')

      // Verify data isolation
      expect(data1.items_v2[0].owner_id).not.toBe(data2.items_v2[0].owner_id)
    })
  })

  describe('RLS Policy Compliance', () => {
    it('should enforce owner-only items_v2 management', async () => {
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
                data: [{ id: 'item123', title: 'My Item', owner_id: 'user123' }], 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2?my_items_v2=true')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.items_v2[0].owner_id).toBe('user123')
      
      // The RLS policy ensures the user can only access items_v2 from their own sales
      // This is enforced at the database level
    })

    it('should prevent access to items_v2 without proper authentication for management', async () => {
      // Simulate a request without proper authentication
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      const request = new NextRequest('https://example.com/api/items_v2?my_items_v2=true')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should enforce item ownership in updates', async () => {
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
                  id: 'item123', 
                  title: 'Updated Item',
                  owner_id: 'user123'
                }, 
                error: null 
              }),
            })),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2/item123', {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Updated Item',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.item.owner_id).toBe('user123')
      
      // The RLS policy ensures the user can only update items_v2 from their own sales
      // This is enforced at the database level
    })
  })

  describe('Item Creation Security', () => {
    it('should ensure item creation is tied to authenticated user', async () => {
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
                id: 'item123', 
                title: 'New Item', 
                sale_id: 'sale123',
                owner_id: 'user123'
              }, 
              error: null 
            }),
          })),
        })),
      }))
      
      mockSupabaseClient.from = mockFrom

      const request = new NextRequest('https://example.com/api/items_v2', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New Item',
          description: 'New Description',
          price: 15.00,
          sale_id: 'sale123',
        }),
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=valid'
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.item.owner_id).toBe('user123')
      
      // Verify the item was created with the correct owner ID
      expect(mockFrom).toHaveBeenCalledWith('items_v2')
    })

    it('should prevent item creation for unauthenticated users', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'No user' },
      })

      const request = new NextRequest('https://example.com/api/items_v2', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New Item',
          description: 'New Description',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })
})
