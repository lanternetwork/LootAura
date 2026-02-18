/**
 * Integration tests for CSRF protection
 * Tests CSRF enforcement on representative mutation endpoints
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'

// Create a chainable mock object
const createChainableMock = () => {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { is_locked: false }, error: null }),
  }
  return chain
}

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
  },
  from: vi.fn(() => createChainableMock()),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

// Mock rate limiting - allow all requests
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, softLimited: false, resetAt: Date.now() + 60000 }),
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
  generateOperationId: vi.fn(() => 'test-op-id-123'),
}))

// Mock data access functions
vi.mock('@/lib/data/ratingsAccess', () => ({
  upsertSellerRating: vi.fn().mockResolvedValue({
    success: true,
    summary: { avg_rating: 4.5, ratings_count: 1 },
  }),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: async (_request?: any) => mockSupabaseClient,
  getAdminDb: () => mockSupabaseClient,
  fromBase: (db: any, table: string) => {
    // Always return a proper chainable mock
    return createChainableMock()
  },
}))

// Mock CSRF validation to actually enforce in tests
// This allows us to test CSRF enforcement without the test environment bypass
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual('@/lib/csrf')
  return {
    ...actual,
    requireCsrfToken: (request: Request) => {
      // Actually validate CSRF in tests (don't bypass)
      const tokenFromHeader = request.headers.get('x-csrf-token')
      const cookieHeader = request.headers.get('cookie')
      let tokenFromCookie: string | null = null
      
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim())
        for (const cookie of cookies) {
          const equalIndex = cookie.indexOf('=')
          if (equalIndex === -1) continue
          const name = cookie.substring(0, equalIndex).trim()
          const value = cookie.substring(equalIndex + 1).trim()
          if (name === 'csrf-token') {
            tokenFromCookie = decodeURIComponent(value)
            break
          }
        }
      }
      
      if (!tokenFromHeader || !tokenFromCookie) {
        return false
      }
      
      return tokenFromHeader === tokenFromCookie
    },
  }
})

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
  } as any)
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
      } as any)

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
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'favorite-id', sale_id: 'sale-id', user_id: 'test-user-id' },
        error: null,
      })
      
      mockSupabaseClient.from.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        upsert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockSingle,
        maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
      })
      
      mockInsert.mockReturnValue({
        select: mockSelect,
      })
      mockSelect.mockReturnValue({
        single: mockSingle,
      })

      const request = createRequestWithCsrf(
        'http://localhost/api/favorites',
        'POST',
        { sale_id: 'sale-id' }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toBeDefined()
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
      const mockUpsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { user_id: 'test-user-id', theme: 'dark' },
        error: null,
      })
      
      mockSupabaseClient.from.mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: mockSelect,
        upsert: mockUpsert,
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        maybeSingle: mockMaybeSingle,
      })
      
      mockUpsert.mockReturnValue({
        select: mockSelect,
      })
      mockSelect.mockReturnValue({
        maybeSingle: mockMaybeSingle,
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
      
      // Mock successful sales fetch - need to check actual implementation
      // For now, just verify it doesn't require CSRF (GET requests are exempt)
      const request = new NextRequest('http://localhost/api/sales?north=38.1&south=38.0&east=-85.0&west=-85.1', {
        method: 'GET',
        // No CSRF token
      })

      const response = await GET(request)
      
      // GET requests should not return 403 for missing CSRF
      expect(response.status).not.toBe(403)
    })

    it('GET /api/public/profile does not require CSRF token', async () => {
      const { GET } = await import('@/app/api/public/profile/route')
      
      // Mock successful profile fetch
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'user-id', username: 'testuser' },
        error: null,
      })
      
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        insert: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: mockEq,
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        maybeSingle: mockMaybeSingle,
      })
      
      mockSelect.mockReturnValue({
        eq: mockEq,
      })
      mockEq.mockReturnValue({
        maybeSingle: mockMaybeSingle,
      })

      const request = new NextRequest('http://localhost/api/public/profile?username=testuser', {
        method: 'GET',
        // No CSRF token
      })

      const response = await GET(request)
      
      // GET requests should not return 403 for missing CSRF
      expect(response.status).not.toBe(403)
    })
  })
})

