/**
 * Integration tests for seller rating API
 * Tests POST /api/seller/rating
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'

// Mock Supabase client
const mockUpsert = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockMaybeSingle = vi.fn()

const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'rater-user-id' } }, error: null }),
  },
  from: vi.fn((table: string) => {
    if (table === 'seller_ratings') {
      return {
        upsert: mockUpsert,
      }
    }
    if (table === 'owner_stats') {
      return {
        select: vi.fn(() => ({
          eq: mockEq,
        })),
      }
    }
    return {
      select: mockSelect,
      eq: mockEq,
    }
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

// Mock CSRF validation to actually enforce in tests
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

// Mock rate limiting - allow all requests by default
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn().mockResolvedValue({ 
    allowed: true, 
    remaining: 10,
    softLimited: false,
    resetAt: Date.now() + 60000,
  }),
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

let POST: any
beforeAll(async () => {
  const route = await import('@/app/api/seller/rating/route')
  POST = route.POST
})

// Helper function to create a request with CSRF token
function createRequestWithCsrf(url: string, body: any, options: { authenticated?: boolean; csrfToken?: string | null } = {}): NextRequest {
  const { authenticated = true, csrfToken = generateCsrfToken() } = options
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken
    headers['cookie'] = `csrf-token=${csrfToken}`
  }
  
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
    duplex: 'half',
  })
}

describe('POST /api/seller/rating', () => {
  const sellerId = 'seller-user-id'
  const raterId = 'rater-user-id'
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset auth mock to return authenticated user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: raterId } },
      error: null,
    })
    
    // Reset owner_stats mock
    mockEq.mockReturnValue({
      maybeSingle: mockMaybeSingle,
    })
    
    // Default successful upsert
    mockUpsert.mockResolvedValue({
      error: null,
    })
    
    // Default owner_stats response
    mockMaybeSingle.mockResolvedValue({
      data: {
        avg_rating: 4.5,
        ratings_count: 1,
      },
      error: null,
    })
  })

  it('creates a rating successfully', async () => {
    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 5,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.rating).toBe(5)
    expect(data.summary).toBeDefined()
    expect(data.summary.avg_rating).toBeGreaterThanOrEqual(1)
    expect(data.summary.avg_rating).toBeLessThanOrEqual(5)
    expect(data.summary.ratings_count).toBeGreaterThanOrEqual(1)
    
    // Verify upsert was called with correct parameters
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        seller_id: sellerId,
        rater_id: raterId,
        rating: 5,
        sale_id: null,
      }),
      expect.objectContaining({
        onConflict: 'seller_id,rater_id',
      })
    )
  })

  it('updates existing rating', async () => {
    // First rating
    const request1 = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 3,
      sale_id: null,
    })

    const response1 = await POST(request1)
    expect(response1.status).toBe(200)
    
    // Update rating
    mockMaybeSingle.mockResolvedValue({
      data: {
        avg_rating: 4.0,
        ratings_count: 1, // Count should remain the same
      },
      error: null,
    })
    
    const request2 = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 4,
      sale_id: null,
    })

    const response2 = await POST(request2)
    const data2 = await response2.json()

    expect(response2.status).toBe(200)
    expect(data2.rating).toBe(4)
    expect(data2.summary.avg_rating).toBe(4.0)
    expect(data2.summary.ratings_count).toBe(1) // Count unchanged
    
    // Verify upsert was called twice (create then update)
    expect(mockUpsert).toHaveBeenCalledTimes(2)
  })

  it('rejects self-rating', async () => {
    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: raterId, // Same as authenticated user
      rating: 5,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_INPUT')
    expect(data.error).toContain('Cannot rate yourself')
    
    // Verify upsert was NOT called
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('validates rating range - rejects rating 0', async () => {
    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 0,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_INPUT')
    expect(data.error).toContain('between 1 and 5')
  })

  it('validates rating range - rejects rating 6', async () => {
    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 6,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_INPUT')
    expect(data.error).toContain('between 1 and 5')
  })

  it('requires authentication', async () => {
    // Mock unauthenticated user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 5,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('AUTH_REQUIRED')
    expect(data.error).toContain('Authentication required')
    
    // Verify upsert was NOT called
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('enforces CSRF - rejects request without CSRF token', async () => {
    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 5,
      sale_id: null,
    }, { csrfToken: null })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('CSRF_INVALID')
    expect(data.error).toContain('CSRF token')
    
    // Verify upsert was NOT called
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('enforces CSRF - rejects request with invalid CSRF token', async () => {
    const token1 = generateCsrfToken()
    const token2 = generateCsrfToken()
    
    // Header has token1, cookie has token2 (mismatch)
    const request = new NextRequest('http://localhost/api/seller/rating', {
      method: 'POST',
      body: JSON.stringify({
        seller_id: sellerId,
        rating: 5,
        sale_id: null,
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': token1,
        'cookie': `csrf-token=${token2}`,
      },
      duplex: 'half',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('CSRF_INVALID')
    
    // Verify upsert was NOT called
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('enforces rate limiting', async () => {
    const { check } = await import('@/lib/rateLimit/limiter')
    
    // Mock rate limit exceeded
    vi.mocked(check).mockResolvedValueOnce({ 
      allowed: true, 
      remaining: 10,
      softLimited: false,
      resetAt: Date.now() + 60000,
    }).mockResolvedValueOnce({ 
      allowed: false, 
      remaining: 0,
      softLimited: false,
      resetAt: Date.now() + 60000,
    })

    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 5,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(data.error).toContain('Too many rating changes')
    
    // Verify upsert was NOT called when rate limited
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('validates required seller_id', async () => {
    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      rating: 5,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_INPUT')
    expect(data.error).toContain('seller_id')
  })

  it('validates required rating', async () => {
    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_INPUT')
    expect(data.error).toContain('rating')
  })

  it('handles database errors gracefully', async () => {
    // Mock database error
    mockUpsert.mockResolvedValue({
      error: {
        code: '23514',
        message: 'Check constraint violation',
      },
    })

    const request = createRequestWithCsrf('http://localhost/api/seller/rating', {
      seller_id: sellerId,
      rating: 5,
      sale_id: null,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('RATING_SAVE_FAILED')
  })

  it('handles invalid JSON gracefully', async () => {
    const csrfToken = generateCsrfToken()
    const request = new NextRequest('http://localhost/api/seller/rating', {
      method: 'POST',
      body: 'invalid json',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        'cookie': `csrf-token=${csrfToken}`,
      },
      duplex: 'half',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_JSON')
  })
})

