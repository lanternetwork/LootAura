/**
 * Integration tests for CSRF protection
 * Tests CSRF enforcement on representative mutation endpoints
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
  })),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

// Mock rate limiting - allow all requests
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
}))

vi.mock('@/lib/rateLimit/keys', () => ({
  deriveKey: vi.fn().mockResolvedValue('test-key'),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock data access functions
vi.mock('@/lib/data/ratingsAccess', () => ({
  upsertSellerRating: vi.fn().mockResolvedValue({
    success: true,
    summary: { avg_rating: 4.5, ratings_count: 1 },
  }),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockSupabaseClient,
  getAdminDb: () => mockSupabaseClient,
  fromBase: (db: any, table: string) => db.from(table),
}))

// Helper function to create a request with CSRF token
function createRequestWithCsrf(
  url: string,
  method: string,
  body: any,
  options: { csrfToken?: string | null } = {}
): NextRequest {
  const { csrfToken = generateCsrfToken() } = options
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken
    headers['cookie'] = `csrf-token=${csrfToken}`
  }
  
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers,
  })
}

describe('CSRF Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null,
    })
  })

  describe('POST /api/seller/rating', () => {
    let POST: any
    
    beforeAll(async () => {
      const route = await import('@/app/api/seller/rating/route')
      POST = route.POST
    })

    it('rejects POST without CSRF token', async () => {
      const request = createRequestWithCsrf(
        'http://localhost/api/seller/rating',
        'POST',
        { seller_id: 'seller-id', rating: 5 },
        { csrfToken: null }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('CSRF_INVALID')
      expect(data.error).toContain('CSRF token')
    })

    it('accepts POST with valid CSRF token', async () => {
      const request = createRequestWithCsrf(
        'http://localhost/api/seller/rating',
        'POST',
        { seller_id: 'seller-id', rating: 5 }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it('rejects POST with invalid CSRF token (mismatched header/cookie)', async () => {
      const token1 = generateCsrfToken()
      const token2 = generateCsrfToken()
      
      // Header has token1, cookie has token2 (mismatch)
      const request = new NextRequest('http://localhost/api/seller/rating', {
        method: 'POST',
        body: JSON.stringify({ seller_id: 'seller-id', rating: 5 }),
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token1,
          'cookie': `csrf-token=${token2}`,
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('CSRF_INVALID')
    })
  })

  describe('POST /api/favorites', () => {
    let POST: any
    
    beforeAll(async () => {
      const route = await import('@/app/api/favorites/route')
      POST = route.POST
    })

    it('rejects POST without CSRF token', async () => {
      const request = createRequestWithCsrf(
        'http://localhost/api/favorites',
        'POST',
        { sale_id: 'sale-id' },
        { csrfToken: null }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('CSRF_INVALID')
    })

    it('accepts POST with valid CSRF token', async () => {
      // Mock successful favorite creation
      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'favorite-id', sale_id: 'sale-id', user_id: 'test-user-id' },
          error: null,
        }),
      })

      const request = createRequestWithCsrf(
        'http://localhost/api/favorites',
        'POST',
        { sale_id: 'sale-id' }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })

  describe('PUT /api/preferences', () => {
    let PUT: any
    
    beforeAll(async () => {
      const route = await import('@/app/api/preferences/route')
      PUT = route.PUT
    })

    it('rejects PUT without CSRF token', async () => {
      const request = createRequestWithCsrf(
        'http://localhost/api/preferences',
        'PUT',
        { theme: 'dark' },
        { csrfToken: null }
      )

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.ok).toBe(false)
      expect(data.code).toBe('CSRF_INVALID')
    })

    it('accepts PUT with valid CSRF token', async () => {
      // Mock successful preferences update
      mockSupabaseClient.from.mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: 'test-user-id', theme: 'dark' },
          error: null,
        }),
      })

      const request = createRequestWithCsrf(
        'http://localhost/api/preferences',
        'PUT',
        { theme: 'dark' }
      )

      const response = await PUT(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })

  describe('GET endpoints do NOT require CSRF', () => {
    it('GET /api/sales does not require CSRF token', async () => {
      const { GET } = await import('@/app/api/sales/route')
      
      // Mock successful sales fetch
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [{ id: 'sale-1', title: 'Test Sale' }],
          error: null,
        }),
      })

      const request = new NextRequest('http://localhost/api/sales?north=38.1&south=38.0&east=-85.0&west=-85.1', {
        method: 'GET',
        // No CSRF token
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it('GET /api/public/profile does not require CSRF token', async () => {
      const { GET } = await import('@/app/api/public/profile/route')
      
      // Mock successful profile fetch
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'user-id', username: 'testuser' },
          error: null,
        }),
      })

      const request = new NextRequest('http://localhost/api/public/profile?username=testuser', {
        method: 'GET',
        // No CSRF token
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toBeDefined()
    })
  })
})

