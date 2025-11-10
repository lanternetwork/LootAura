import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

// Mock NextResponse
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server')
  return {
    ...actual,
    NextResponse: {
      redirect: vi.fn((url, status) => ({ url: url.toString(), status })),
      next: vi.fn(() => ({ type: 'next' })),
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

// Mock auth helpers
vi.mock('@/lib/auth/server-session', () => ({
  hasValidSession: vi.fn(() => false),
  validateSession: vi.fn(() => null),
}))

describe('OAuth Callback Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should bypass /auth/callback route completely', async () => {
    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    const { NextResponse } = await import('next/server')
    
    await middleware(request)
    
    // Middleware should bypass /auth/callback to prevent redirect loops
    expect(NextResponse.next).toHaveBeenCalled()
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it('should allow OAuth callbacks to go directly to /auth/callback without middleware interference', async () => {
    const request = new NextRequest('https://example.com/auth/callback?error=access_denied')
    const { NextResponse } = await import('next/server')
    
    await middleware(request)
    
    // Middleware should bypass /auth/callback to prevent redirect loops
    expect(NextResponse.next).toHaveBeenCalled()
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it('should allow /auth/callback with all query parameters to pass through', async () => {
    const request = new NextRequest('https://example.com/auth/callback?code=abc123&state=xyz&next=/sales')
    const { NextResponse } = await import('next/server')
    
    await middleware(request)
    
    // Middleware should bypass /auth/callback to prevent redirect loops
    expect(NextResponse.next).toHaveBeenCalled()
    expect(NextResponse.redirect).not.toHaveBeenCalled()
  })

  it('should not redirect if no code or error parameters', async () => {
    const request = new NextRequest('https://example.com/')
    const { NextResponse } = await import('next/server')
    
    await middleware(request)
    
    expect(NextResponse.next).toHaveBeenCalled()
  })
})
