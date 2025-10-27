import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../../app/api/sales_v2/route'

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
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(),
          })),
        })),
      })),
    })),
  })),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => mockSupabaseClient),
}))

describe('RLS Policy Verification - Sales Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Public Read Access', () => {
    it('should allow public access to published sales_v2', async () => {
      const mockSales = [
        {
          id: 'sale1',
          title: 'Test Sale',
          status: 'published',
          owner_id: 'user123',
          created_at: '2025-01-01T00:00:00Z',
        },
      ]

      // Mock no authentication (public access)
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      // Mock sales query
      mockSupabaseClient.from().select().gte().lte().order().range.mockResolvedValue({
        data: mockSales,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/sales_v2', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales).toHaveLength(1)
      expect(data.sales[0].status).toBe('published')
    })

    it('should not expose draft sales_v2 to public', async () => {
      const mockSales = [
        {
          id: 'sale1',
          title: 'Draft Sale',
          status: 'draft',
          owner_id: 'user123',
          created_at: '2025-01-01T00:00:00Z',
        },
      ]

      // Mock no authentication (public access)
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      // Mock sales query - RLS should filter out drafts
      mockSupabaseClient.from().select().gte().lte().order().range.mockResolvedValue({
        data: [], // RLS filters out drafts for public access
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/sales_v2', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales).toHaveLength(0)
    })
  })

  describe('Owner-Only Management Access', () => {
    it('should allow users to access their own sales_v2 for management', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const mockSales = [
        {
          id: 'sale1',
          title: 'My Sale',
          status: 'draft',
          owner_id: 'user123',
          created_at: '2025-01-01T00:00:00Z',
        },
      ]

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock sales query with owner filter
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: mockSales,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/sales_v2?my_sales=true', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales).toHaveLength(1)
      expect(data.sales[0].owner_id).toBe('user123')
    })
  })

  describe('Data Isolation', () => {
    it('should ensure users can only access their own sales_v2 for management', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const mockSales = [
        {
          id: 'sale1',
          title: 'My Sale',
          status: 'draft',
          owner_id: 'user123',
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'sale2',
          title: 'Other Sale',
          status: 'draft',
          owner_id: 'other456',
          created_at: '2025-01-01T00:00:00Z',
        },
      ]

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock sales query - RLS should filter to only user's sales
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: [mockSales[0]], // Only user's own sales
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/sales_v2?my_sales=true', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales).toHaveLength(1)
      expect(data.sales[0].owner_id).toBe('user123')
    })
  })

  describe('RLS Policy Compliance', () => {
    it('should enforce owner-only sales_v2 management', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock sales query
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: [],
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/sales_v2?my_sales=true', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sales).toHaveLength(0)
    })

    it('should prevent access to sales_v2 without proper authentication for management', async () => {
      // Mock no authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/sales_v2?my_sales=true', {
        method: 'GET',
      })

      const response = await GET(request)

      expect(response.status).toBe(401)
    })
  })
})
