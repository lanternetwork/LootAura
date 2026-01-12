import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../../app/auth/callback/route'

// Mock NextResponse
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
    get: vi.fn(() => null),
    set: vi.fn(),
  }))
}))

// Mock Supabase auth helpers
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: vi.fn()
    }
  }))
}))

describe('OAuth Callback Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
    const { createServerClient } = await import('@supabase/ssr')
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Invalid code' }
        })
      }
    }
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    const response = await GET(request)
    
    expect(response.url).toContain('/auth/error?error=Invalid%20code')
  })

  it('should redirect to /sales when code exchange succeeds', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user123' }
            }
          },
          error: null
        }),
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user123' }
            }
          },
          error: null
        })
      }
    }
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    const response = await GET(request)
    
    expect(response.url).toContain('/sales')
  })

  it('should redirect to custom next parameter when provided', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user123' }
            }
          },
          error: null
        }),
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user123' }
            }
          },
          error: null
        })
      }
    }
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any)

    const request = new NextRequest('https://example.com/auth/callback?code=abc123&next=/favorites')
    
    const response = await GET(request)
    
    expect(response.url).toContain('/favorites')
  })

  it('should redirect to sale creation when redirectTo is double-encoded (OAuth flow)', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user123' }
            }
          },
          error: null
        }),
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user123' }
            }
          },
          error: null
        })
      }
    }
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any)

    // Simulate OAuth callback with double-encoded redirectTo (preserved through OAuth)
    // OAuth providers may encode query params, so redirectTo gets double-encoded
    const redirectDestination = encodeURIComponent(encodeURIComponent('/sell/new?resume=review'))
    const request = new NextRequest(`https://example.com/auth/callback?code=abc123&redirectTo=${redirectDestination}`)
    
    const response = await GET(request)
    
    // Should redirect to sale creation page with resume parameter
    expect(response.url).toContain('/sell/new')
    expect(response.url).toContain('resume=review')
  })
})
