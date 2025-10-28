import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

// Mock the server session module
vi.mock('@/lib/auth/server-session', () => ({
  hasValidSession: vi.fn(),
  validateSession: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}))

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
  })),
}))

describe('Session Protection Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_DEBUG = 'false'
  })

  describe('Public routes', () => {
    it('should allow access to public pages', async () => {
      const request = new NextRequest('http://localhost:3000/')
      const response = await middleware(request)
      
      expect(response.status).toBe(200)
    })

    it('should allow access to public API endpoints', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'GET',
      })
      const response = await middleware(request)
      
      expect(response.status).toBe(200)
    })

    it('should allow access to auth pages', async () => {
      const request = new NextRequest('http://localhost:3000/auth/signin')
      const response = await middleware(request)
      
      expect(response.status).toBe(200)
    })
  })

  describe('Protected routes', () => {
    it('should redirect to signin for protected pages without session', async () => {
      const { hasValidSession } = await import('@/lib/auth/server-session')
      vi.mocked(hasValidSession).mockReturnValue(false)

      const request = new NextRequest('http://localhost:3000/account')
      const response = await middleware(request)
      
      expect(response.status).toBe(307) // Redirect
      expect(response.headers.get('location')).toContain('/auth/signin')
    })

    it('should return 401 for protected API without session', async () => {
      const { hasValidSession } = await import('@/lib/auth/server-session')
      vi.mocked(hasValidSession).mockReturnValue(false)

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
      })
      const response = await middleware(request)
      
      expect(response.status).toBe(401)
    })

    it('should allow access to protected routes with valid session', async () => {
      const { hasValidSession, validateSession } = await import('@/lib/auth/server-session')
      vi.mocked(hasValidSession).mockReturnValue(true)
      vi.mocked(validateSession).mockResolvedValue({
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'test-user', email: 'test@example.com' },
      } as any)

      const request = new NextRequest('http://localhost:3000/account')
      const response = await middleware(request)
      
      expect(response.status).toBe(200)
    })
  })

  describe('Session validation', () => {
    it('should handle session validation failure', async () => {
      const { hasValidSession, validateSession } = await import('@/lib/auth/server-session')
      vi.mocked(hasValidSession).mockReturnValue(true)
      vi.mocked(validateSession).mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/account')
      const response = await middleware(request)
      
      expect(response.status).toBe(307) // Redirect to signin
    })

    it('should handle expired session', async () => {
      const { hasValidSession, validateSession } = await import('@/lib/auth/server-session')
      vi.mocked(hasValidSession).mockReturnValue(true)
      vi.mocked(validateSession).mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
      })
      const response = await middleware(request)
      
      expect(response.status).toBe(401)
    })
  })

  describe('Debug logging', () => {
    it('should log debug information when debug is enabled', async () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { hasValidSession } = await import('@/lib/auth/server-session')
      vi.mocked(hasValidSession).mockReturnValue(false)

      const request = new NextRequest('http://localhost:3000/account')
      await middleware(request)
      
      // The middleware should log authentication checking for protected routes
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MIDDLEWARE] checking authentication for → /account'
      )

      consoleSpy.mockRestore()
    })
  })
})
