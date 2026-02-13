import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/auth/callback/route'

// Mock NextResponse (matching pattern from auth-callback.test.ts)
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server')
  return {
    ...actual,
    NextResponse: {
      redirect: vi.fn((url) => ({ url: url.toString(), type: 'redirect' })),
    }
  }
})

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}))

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    exchangeCodeForSession: vi.fn(),
  },
}

// Mock @supabase/ssr createServerClient
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabaseClient),
}))

// Mock fetch for profile creation
global.fetch = vi.fn()

describe('OAuth Callback Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_DEBUG
    // Set required environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  describe('Error Handling', () => {
    it('should redirect to error page when error parameter is present', async () => {
      const request = new NextRequest('https://example.com/auth/callback?error=access_denied')
      
      const response = await GET(request)
      
      expect(response.url).toContain('/auth/error?error=access_denied')
    })

    it('should redirect to error page when code parameter is missing', async () => {
      const request = new NextRequest('https://example.com/auth/callback')
      
      const response = await GET(request)
      
      expect(response.url).toContain('/auth/error?error=missing_code')
    })

    it('should redirect to error page when code exchange fails', async () => {
      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: null,
        error: { message: 'Invalid code' }
      })

      const request = new NextRequest('https://example.com/auth/callback?code=abc123')
      
      const response = await GET(request)
      
      expect(response.url).toContain('/auth/error?error=Invalid%20code')
    })

    it('should redirect to error page when no session is received', async () => {
      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: null },
        error: null
      })

      const request = new NextRequest('https://example.com/auth/callback?code=abc123')
      
      const response = await GET(request)
      
      expect(response.url).toContain('/auth/error?error=no_session')
    })
  })

  describe('Successful Authentication', () => {
    it('should redirect to /sales when code exchange succeeds', async () => {
      const mockSession = {
        user: { id: 'user123' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }

      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null
      })

      // Mock successful profile creation
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: true }),
      })

      const request = new NextRequest('https://example.com/auth/callback?code=abc123&redirectTo=/sales')
      
      const response = await GET(request)
      
      expect(response.url).toContain('/sales')
    })

    it('should redirect to custom next parameter when provided', async () => {
      const mockSession = {
        user: { id: 'user123' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }

      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null
      })

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: true }),
      })

      const request = new NextRequest('https://example.com/auth/callback?code=abc123&next=/favorites')
      
      const response = await GET(request)
      
      expect(response.url).toContain('/favorites')
    })

    it('should redirect to sale creation when redirectTo is double-encoded (Google OAuth flow)', async () => {
      const mockSession = {
        user: { id: 'user123' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }

      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null
      })

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: true }),
      })

      // Simulate Google OAuth callback with double-encoded redirectTo
      // This tests the fix for sale creation flow where nested query params are preserved
      // OAuth providers may encode query params, so redirectTo gets double-encoded
      const redirectDestination = encodeURIComponent(encodeURIComponent('/sell/new?resume=review'))
      const request = new NextRequest(`https://example.com/auth/callback?code=abc123&redirectTo=${redirectDestination}`)
      
      const response = await GET(request)
      
      // Should redirect to sale creation page with resume parameter
      expect(response.url).toContain('/sell/new')
      expect(response.url).toContain('resume=review')
    })

    it('should attempt profile creation during successful auth', async () => {
      const mockSession = {
        user: { id: 'user123' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }

      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null
      })

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: true }),
      })
      global.fetch = mockFetch

      const request = new NextRequest('https://example.com/auth/callback?code=abc123')
      
      await GET(request)
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          href: 'https://example.com/api/profile'
        }),
        {
          method: 'POST',
          headers: {
            'Cookie': '',
          },
        }
      )
    })

    it('should continue auth flow even if profile creation fails', async () => {
      const mockSession = {
        user: { id: 'user123' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }

      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null
      })

      // Mock failed profile creation
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const request = new NextRequest('https://example.com/auth/callback?code=abc123&redirectTo=/sales')
      
      const response = await GET(request)
      
      // Should still redirect successfully
      expect(response.url).toContain('/sales')
    })
  })

  describe('Debug Logging', () => {
    it('should log debug information when NEXT_PUBLIC_DEBUG is enabled', async () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const mockSession = {
        user: { id: 'user123' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }

      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null
      })

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: true }),
      })

      const request = new NextRequest('https://example.com/auth/callback?code=abc123&redirectTo=/sales')
      
      await GET(request)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '🔄 [AUTH FLOW] oauth-callback → start: start',
        expect.objectContaining({
          hasCode: true,
          hasError: false,
          redirectTo: '/sales',
        })
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Cookie Handling', () => {
    it('should handle cookie operations gracefully', async () => {
      const mockSession = {
        user: { id: 'user123' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }

      mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null
      })

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: true }),
      })

      const request = new NextRequest('https://example.com/auth/callback?code=abc123&redirectTo=/sales', {
        headers: {
          'Cookie': 'session=valid',
        },
      })
      
      const response = await GET(request)
      
      expect(response.url).toContain('/sales')
    })
  })
})
