/**
 * Rate Limiting Integration Tests - Auth Callback
 * 
 * Tests rate limiting behavior on auth callback endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the rate limiting modules
vi.mock('@/lib/rateLimit/config', () => ({
  isRateLimitingEnabled: vi.fn(() => true),
  isPreviewEnv: vi.fn(() => false),
  shouldBypassRateLimit: vi.fn(() => false) // Force rate limiting to be active
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: vi.fn((handler, policies) => {
    return async (req: any) => {
      // Simulate rate limiting logic
      const { deriveKey } = await import('@/lib/rateLimit/keys')
      const { check } = await import('@/lib/rateLimit/limiter')
      const { applyRateHeaders } = await import('@/lib/rateLimit/headers')
      
      const userId = undefined
      const results = []
      
      for (const policy of policies) {
        const key = await deriveKey(req, policy.scope, userId)
        results.push(await check(policy, key))
      }
      
      // Find the most restrictive result
      const mostRestrictive = results.find(r => !r.allowed) || results.find(r => r.softLimited) || results[0]
      
      if (!mostRestrictive) {
        return handler(req)
      }
      
      // Handle hard limit
      if (!mostRestrictive.allowed) {
        const { NextResponse } = await import('next/server')
        const errorResponse = NextResponse.json(
          { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
          { status: 429 }
        )
        
        return applyRateHeaders(
          errorResponse,
          mostRestrictive.policy,
          mostRestrictive.remaining,
          mostRestrictive.resetAt,
          mostRestrictive.softLimited
        )
      }
      
      // Call handler and apply headers
      const response = await handler(req)
      
      return applyRateHeaders(
        response,
        mostRestrictive.policy,
        mostRestrictive.remaining,
        mostRestrictive.resetAt,
        mostRestrictive.softLimited
      )
    }
  })
}))

vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn()
}))

vi.mock('@/lib/rateLimit/keys', () => ({
  deriveKey: vi.fn()
}))

vi.mock('@/lib/rateLimit/headers', () => ({
  applyRateHeaders: vi.fn((response) => response)
}))

vi.mock('@/lib/auth/server-session', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user123' } } },
        error: null
      })
    }
  }))
}))

// Import after mocking
import { GET } from '@/app/api/auth/callback/route'
import { check } from '@/lib/rateLimit/limiter'
import { deriveKey } from '@/lib/rateLimit/keys'
import { applyRateHeaders } from '@/lib/rateLimit/headers'

const mockCheck = check as any
const mockDeriveKey = deriveKey as any
const mockApplyHeaders = applyRateHeaders as any

describe('Rate Limiting Integration - Auth Callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default successful mocks
    mockDeriveKey.mockResolvedValue('ip:192.168.1.1')
    mockCheck.mockResolvedValue({
      allowed: true,
      softLimited: false,
      remaining: 4,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })
    mockApplyHeaders.mockImplementation((response: Response) => response)
  })

  it('should allow requests within rate limit', async () => {
    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    // Mock fetch for profile creation
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: true })
    })
    
    const response = await GET(request)
    
    expect(response.status).toBe(307) // Redirect (not 302)
    expect(mockDeriveKey).toHaveBeenCalledWith(request, 'ip', undefined)
    expect(mockCheck).toHaveBeenCalled()
  })

  it('should return 429 when rate limit exceeded', async () => {
    mockCheck.mockResolvedValue({
      allowed: false,
      softLimited: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })
    
    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    const response = await GET(request)
    
    expect(response.status).toBe(429)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(response.headers.get('Retry-After')).toBeTruthy()
  })

  it('should handle soft limiting correctly', async () => {
    mockCheck.mockResolvedValue({
      allowed: true,
      softLimited: true,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })
    
    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: true })
    })
    
    const response = await GET(request)
    
    expect(response.status).toBe(307) // Still redirects (not 302)
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(response.headers.get('Retry-After')).toBeNull()
  })

  it('should bypass rate limiting when disabled', async () => {
    vi.doMock('@/lib/rateLimit/config', () => ({
      isRateLimitingEnabled: vi.fn(() => false),
      isPreviewEnv: vi.fn(() => true),
      shouldBypassRateLimit: vi.fn(() => true)
    }))
    
    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: true })
    })
    
    const response = await GET(request)
    
    expect(mockCheck).not.toHaveBeenCalled()
    expect(response.status).toBe(307) // Should still work (not 302)
  })
})
