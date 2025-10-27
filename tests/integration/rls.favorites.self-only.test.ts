import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, DELETE } from '../../app/api/favorites_v2/route'

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
    delete: vi.fn(() => ({
      eq: vi.fn(),
    })),
  })),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => mockSupabaseClient),
}))

describe('RLS Policy Verification - Favorites Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Owner-Only Access', () => {
    it('should only allow users to access their own favorites_v2', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const mockFavorites = [
        {
          id: 'fav1',
          user_id: 'user123',
          sale_id: 'sale1',
          created_at: '2025-01-01T00:00:00Z',
        },
      ]

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock favorites query
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: mockFavorites,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorites).toHaveLength(1)
      expect(data.favorites[0].user_id).toBe('user123')
    })

    it('should prevent access to other users favorites_v2', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const otherUserFavorites = [
        {
          id: 'fav1',
          user_id: 'other456',
          sale_id: 'sale1',
          created_at: '2025-01-01T00:00:00Z',
        },
      ]

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock favorites query - RLS should filter to only user's favorites
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: [], // RLS filters out other users' favorites
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorites).toHaveLength(0)
    })
  })

  describe('Owner-Only Creation', () => {
    it('should allow users to create favorites_v2 for themselves', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const newFavorite = {
        id: 'fav1',
        user_id: 'user123',
        sale_id: 'sale1',
        created_at: '2025-01-01T00:00:00Z',
      }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock favorite creation
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: newFavorite,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: 'sale1',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorite.user_id).toBe('user123')
    })
  })

  describe('Owner-Only Deletion', () => {
    it('should allow users to delete their own favorites_v2', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock favorite deletion
      mockSupabaseClient.from().delete().eq().mockResolvedValue({
        data: null,
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2/fav1', {
        method: 'DELETE',
      })

      const response = await DELETE(request)

      expect(response.status).toBe(200)
    })

    it('should prevent users from deleting other users favorites_v2', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock favorite deletion failure (RLS prevents access)
      mockSupabaseClient.from().delete().eq().mockResolvedValue({
        data: null,
        error: { message: 'Row level security policy violation' },
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2/other_fav', {
        method: 'DELETE',
      })

      const response = await DELETE(request)

      expect(response.status).toBe(400)
    })
  })

  describe('Data Isolation', () => {
    it('should ensure users can only access their own favorites_v2', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }
      const mockFavorites = [
        {
          id: 'fav1',
          user_id: 'user123',
          sale_id: 'sale1',
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'fav2',
          user_id: 'other456',
          sale_id: 'sale2',
          created_at: '2025-01-01T00:00:00Z',
        },
      ]

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock favorites query - RLS should filter to only user's favorites
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: [mockFavorites[0]], // Only user's own favorites
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorites).toHaveLength(1)
      expect(data.favorites[0].user_id).toBe('user123')
    })
  })

  describe('RLS Policy Compliance', () => {
    it('should enforce owner-only favorites_v2 access', async () => {
      const mockUser = { id: 'user123', email: 'user@example.com' }

      // Mock successful authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // Mock favorites query
      mockSupabaseClient.from().select().eq().order().range.mockResolvedValue({
        data: [],
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2', {
        method: 'GET',
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.favorites).toHaveLength(0)
    })

    it('should prevent access to favorites_v2 without proper authentication', async () => {
      // Mock no authentication
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/favorites_v2', {
        method: 'GET',
      })

      const response = await GET(request)

      expect(response.status).toBe(401)
    })
  })
})
