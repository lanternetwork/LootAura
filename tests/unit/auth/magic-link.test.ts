import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/magic-link/route'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    signInWithOtp: vi.fn(),
  },
}

vi.mock('@/lib/auth/server-session', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock('@/lib/rateLimiter', () => ({
  createRateLimitMiddleware: vi.fn(() => () => ({ allowed: true })),
  RATE_LIMITS: { AUTH: {} },
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

describe('Magic Link Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_DEBUG
  })

  describe('POST /api/auth/magic-link', () => {
    it('should send magic link successfully', async () => {
      const mockResponse = { data: {}, error: null }
      mockSupabaseClient.auth.signInWithOtp.mockResolvedValueOnce(mockResponse)

      const request = new NextRequest('https://example.com/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('Magic link sent')
      expect(mockSupabaseClient.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: {
          emailRedirectTo: undefined,
          shouldCreateUser: true,
        },
      })
    })

    it('should handle Supabase errors gracefully', async () => {
      const mockError = { message: 'Invalid email' }
      mockSupabaseClient.auth.signInWithOtp.mockResolvedValueOnce({
        data: null,
        error: mockError,
      })

      const request = new NextRequest('https://example.com/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: 'invalid-email' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('Invalid email address')
      expect(data.message).toBe('Failed to send magic link')
    })

    it('should validate email format', async () => {
      const request = new NextRequest('https://example.com/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: 'not-an-email' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input data')
      expect(data.details).toBeDefined()
    })

    it('should handle missing email', async () => {
      const request = new NextRequest('https://example.com/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input data')
    })

    it('should configure email redirect URL when NEXT_PUBLIC_SITE_URL is set', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://myapp.com'
      
      const mockResponse = { data: {}, error: null }
      mockSupabaseClient.auth.signInWithOtp.mockResolvedValueOnce(mockResponse)

      const request = new NextRequest('https://example.com/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      await POST(request)

      expect(mockSupabaseClient.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: {
          emailRedirectTo: 'https://myapp.com/auth/callback',
          shouldCreateUser: true,
        },
      })
    })

    it('should log debug information when NEXT_PUBLIC_DEBUG is enabled', async () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      const mockResponse = { data: {}, error: null }
      mockSupabaseClient.auth.signInWithOtp.mockResolvedValueOnce(mockResponse)

      const request = new NextRequest('https://example.com/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      await POST(request)

      expect(consoleSpy).toHaveBeenCalledWith(
        '📧 [AUTH MAGIC LINK] tes***@example.com: sent',
        expect.objectContaining({
          redirectToSet: false,
        })
      )

      consoleSpy.mockRestore()
    })
  })
})
