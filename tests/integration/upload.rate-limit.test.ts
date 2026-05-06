import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/upload/signed-url/route'
import { createSupabaseServerMock } from '@/tests/utils/mocks/supabaseServerMock'

// Mock the server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

// Mock rate limiter to simulate rate limiting
const mockRateLimitMiddleware = vi.fn()
vi.mock('@/lib/rateLimiter', () => ({
  createRateLimitMiddleware: vi.fn(() => mockRateLimitMiddleware),
  RATE_LIMITS: {
    UPLOAD_SIGNER: { limit: 5, windowMs: 60000, keyGenerator: () => 'test-key' }
  }
}))

describe('Upload Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should allow requests within rate limit', async () => {
    mockRateLimitMiddleware.mockReturnValue({ allowed: true })
    const mockSupabase = createSupabaseServerMock({ userId: 'user-123', withStorage: true })

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        entity: 'sale'
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  it('should block requests when rate limit exceeded', async () => {
    mockRateLimitMiddleware.mockReturnValue({ 
      allowed: false, 
      error: 'Too many requests. Please try again later.' 
    })

    const request = new NextRequest('http://localhost:3000/api/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        entity: 'sale'
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(data.error).toBe('Too many requests. Please try again later.')
  })

  it('should log rate limit events when debug is enabled', async () => {
    process.env.NEXT_PUBLIC_DEBUG = 'true'
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockRateLimitMiddleware.mockReturnValue({ 
      allowed: false, 
      error: 'Too many requests. Please try again later.' 
    })

    const request = new NextRequest('http://localhost:3000/api/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        entity: 'sale'
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    await POST(request)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[UPLOAD] Rate limited',
      expect.objectContaining({ event: 'upload-signer', status: 'fail' })
    )

    consoleSpy.mockRestore()
  })
})
