import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/upload/signed-url/route'

// Mock the server client
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
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

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null,
        }),
      },
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://signed-url.example.com' },
            error: null,
          }),
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: 'https://public-url.example.com/image.jpg' }
          }),
        })),
      },
    }

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
      '[RATE_LIMIT] Rate limit exceeded',
      expect.objectContaining({
        event: 'rate-limit',
        key: 'upload-signer',
        limit: 5,
        windowMs: 60000
      })
    )

    consoleSpy.mockRestore()
  })
})
