import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/upload/signed-url/route'

// Mock the server client
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

// Mock rate limiter
vi.mock('@/lib/rateLimiter', () => ({
  createRateLimitMiddleware: vi.fn(() => () => ({ allowed: true })),
  RATE_LIMITS: {
    UPLOAD_SIGNER: { limit: 5, windowMs: 60000, keyGenerator: () => 'test-key' }
  }
}))

describe('Upload Signed URL API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  it('should reject invalid MIME type', async () => {
    const request = new NextRequest('http://localhost:3000/api/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: 'text/plain',
        sizeBytes: 1024,
        entity: 'sale'
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid upload request')
    expect(data.details).toBeDefined()
  })

  it('should reject oversized files', async () => {
    const request = new NextRequest('http://localhost:3000/api/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        sizeBytes: 10 * 1024 * 1024, // 10MB
        entity: 'sale'
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid upload request')
  })

  it('should reject unauthenticated requests', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Not authenticated' },
        }),
      },
    }

    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

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

    expect(response.status).toBe(401)
    expect(data.error).toBe('Authentication required')
  })

  it('should create signed URL for valid request', async () => {
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

    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('http://localhost:3000/api/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        entity: 'sale',
        entityId: 'sale-123'
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.uploadUrl).toBe('https://signed-url.example.com')
    expect(data.publicUrl).toBe('https://public-url.example.com/image.jpg')
    expect(data.expiresIn).toBe(3600)
    expect(data.objectKey).toMatch(/^sale\/\d+-[a-z0-9]+\.jpeg$/)
  })

  it('should handle storage errors gracefully', async () => {
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
            data: null,
            error: { message: 'Storage error' },
          }),
        })),
      },
    }

    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

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

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to create upload URL')
  })
})
