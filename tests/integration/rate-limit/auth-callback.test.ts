/**
 * Rate Limiting Integration Tests - Auth Callback
 * 
 * Tests rate limiting behavior on auth callback endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the rate limiting modules
vi.mock('@/lib/rateLimit/config', () => ({
  shouldBypassRateLimit: vi.fn(() => false)
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: vi.fn((handler) => handler)
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

// Import after mocking
import { callbackHandler } from '@/app/api/auth/callback/route'
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
    mockApplyHeaders.mockImplementation((response) => response)
  })

  it('should allow requests within rate limit', async () => {
    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    // Mock successful auth flow
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
    
    // Mock fetch for profile creation
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: true })
    })
    
    const response = await callbackHandler(request)
    
    expect(response.status).toBe(302) // Redirect
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
    
    const response = await callbackHandler(request)
    
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
    
    // Mock successful auth flow
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
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: true })
    })
    
    const response = await callbackHandler(request)
    
    expect(response.status).toBe(302) // Still redirects
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(response.headers.get('Retry-After')).toBeNull()
  })

  it('should bypass rate limiting when disabled', async () => {
    vi.doMock('@/lib/rateLimit/config', () => ({
      shouldBypassRateLimit: vi.fn(() => true)
    }))
    
    const request = new NextRequest('https://example.com/auth/callback?code=abc123')
    
    const response = await callbackHandler(request)
    
    expect(mockCheck).not.toHaveBeenCalled()
    expect(response.status).toBe(302) // Should still work
  })
})
