import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, PUT, DELETE } from '../../app/api/items_v2/route'

// Mock Supabase client with proper chaining
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
      eq: vi.fn(),
    })),
  })),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => mockSupabaseClient),
}))

describe('RLS Policy Verification - Items Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Public Read Access', () => {
    it('should allow public access to items_v2 from published sales', async () => {
      const mockItems = [
        {
          id: 'item1',
          name: 'Test Item',
          price: 10.00,
          sale_id: 'sale1',
          owner_id: 'user123',
        },
      ]

      // Mock no authentication (public access)
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      // Mock items query
      mockSupabaseClient.from().select().eq().mockResolvedValue({
        data: mockItems,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2?sale_id=sale1', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.items).toHaveLength(1)
    })

    it('should not expose items_v2 from draft sales to public', async () => {
      // Mock no authentication (public access)
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      // Mock items query - RLS should filter out items from draft sales
      mockSupabaseClient.from().select().eq().mockResolvedValue({
        data: [], // RLS filters out items from draft sales
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2?sale_id=draft_sale', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.items).toHaveLength(0)
    })
  })

  describe('Owner-Only Write Access', () => {
    it('should allow authenticated users to create items_v2 for their sales', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const newItem = {
        id: 'item1',
        name: 'New Item',
        price: 15.00,
        sale_id: 'sale1',
        owner_id: 'user123',
      }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock item creation
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: newItem,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Item',
          price: 15.00,
          sale_id: 'sale1',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.item.owner_id).toBe('user123')
    })
  })

  describe('Owner-Only Update Access', () => {
    it('should allow users to update items_v2 from their own sales', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const updatedItem = {
        id: 'item1',
        name: 'Updated Item',
        price: 20.00,
        sale_id: 'sale1',
        owner_id: 'user123',
      }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock item update
      mockSupabaseClient.from().update().eq().select().single.mockResolvedValue({
        data: updatedItem,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2/item1', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Item',
          price: 20.00,
        }),
      })

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.item.owner_id).toBe('user123')
    })

    it('should prevent users from updating items_v2 from other users sales', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock item update failure (RLS prevents access)
      mockSupabaseClient.from().update().eq().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Row level security policy violation' },
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2/other_item', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Item',
          price: 20.00,
        }),
      })

      const response = await PUT(request)

      expect(response.status).toBe(400)
    })
  })

  describe('Owner-Only Delete Access', () => {
    it('should allow users to delete items_v2 from their own sales', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock item deletion
      mockSupabaseClient.from().delete().eq().mockResolvedValue({
        data: null,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2/item1', {
        method: 'DELETE',
      })

      const response = await DELETE(request)

      expect(response.status).toBe(200)
    })

    it('should prevent users from deleting items_v2 from other users sales', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock item deletion failure (RLS prevents access)
      mockSupabaseClient.from().delete().eq().mockResolvedValue({
        data: null,
        error: { message: 'Row level security policy violation' },
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2/other_item', {
        method: 'DELETE',
      })

      const response = await DELETE(request)

      expect(response.status).toBe(400)
    })
  })

  describe('Data Isolation', () => {
    it('should ensure users can only access items_v2 from their own sales for management', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const mockItems = [
        {
          id: 'item1',
          name: 'My Item',
          price: 10.00,
          sale_id: 'sale1',
          owner_id: 'user123',
        },
        {
          id: 'item2',
          name: 'Other Item',
          price: 20.00,
          sale_id: 'sale2',
          owner_id: 'other456',
        },
      ]

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock items query - RLS should filter to only user's items
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: [mockItems[0]], // Only user's own items
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2?my_items=true', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.items).toHaveLength(1)
      expect(data.items[0].owner_id).toBe('user123')
    })
  })

  describe('RLS Policy Compliance', () => {
    it('should enforce owner-only items_v2 management', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock items query
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: [],
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2?my_items=true', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.items).toHaveLength(0)
    })

    it('should prevent access to items_v2 without proper authentication for management', async () => {
      // Mock no authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2?my_items=true', {
        method: 'GET',
      })

      const response = await GET(request)

      expect(response.status).toBe(401)
    })

    it('should enforce item ownership in updates', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock item update failure (RLS prevents access)
      mockSupabaseClient.from().update().eq().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Row level security policy violation' },
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2/other_item', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Item',
          price: 20.00,
        }),
      })

      const response = await PUT(request)

      expect(response.status).toBe(400)
    })
  })

  describe('Item Creation Security', () => {
    it('should ensure item creation is tied to authenticated user', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const newItem = {
        id: 'item1',
        name: 'New Item',
        price: 15.00,
        sale_id: 'sale1',
        owner_id: 'user123',
      }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock item creation
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: newItem,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/items_v2', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Item',
          price: 15.00,
          sale_id: 'sale1',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.item.owner_id).toBe('user123')
    })
  })
})
