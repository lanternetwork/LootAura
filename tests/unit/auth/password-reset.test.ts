import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/reset-password/route'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    resetPasswordForEmail: vi.fn(),
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

describe('Password Reset Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_DEBUG
  })

  describe('POST /api/auth/reset-password', () => {
    it('should send password reset email successfully', async () => {
      const mockResponse = { data: {}, error: null }
      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValueOnce(mockResponse)

      const request = new NextRequest('https://example.com/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('Password reset email sent')
      expect(mockSupabaseClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        { redirectTo: undefined }
      )
    })

    it('should handle Supabase errors gracefully', async () => {
      const mockError = { message: 'User not found' }
      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValueOnce({
        data: null,
        error: mockError,
      })

      const request = new NextRequest('https://example.com/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('RESET_FAILED')
      expect(data.error).toBe('Failed to send password reset email. Please try again.')
    })

    it('should validate email format', async () => {
      const request = new NextRequest('https://example.com/api/auth/reset-password', {
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
      const request = new NextRequest('https://example.com/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input data')
    })

    it('should configure redirect URL when NEXT_PUBLIC_SITE_URL is set', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://myapp.com'
      
      const mockResponse = { data: {}, error: null }
      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValueOnce(mockResponse)

      const request = new NextRequest('https://example.com/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      await POST(request)

      expect(mockSupabaseClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        { redirectTo: 'https://myapp.com/auth/reset-password' }
      )
    })

    it('should log debug information when NEXT_PUBLIC_DEBUG is enabled', async () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      const mockResponse = { data: {}, error: null }
      mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValueOnce(mockResponse)

      const request = new NextRequest('https://example.com/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      await POST(request)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[AUTH] Password reset request:',
        expect.objectContaining({
          event: 'password-reset',
          email: 'test@example.com',
        })
      )

      consoleSpy.mockRestore()
    })
  })
})
