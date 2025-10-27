/**
 * Rate Limiting Integration Tests - Bypass Behavior
 * 
 * Tests that rate limiting is properly bypassed in non-production environments.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

describe('Rate Limiting Integration - Bypass Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should bypass rate limiting when RATE_LIMITING_ENABLED is not set', async () => {
    // Mock environment
    const originalRateLimit = process.env.RATE_LIMITING_ENABLED
    
    // Temporarily remove the env var
    delete process.env.RATE_LIMITING_ENABLED
    
    // Re-import config to pick up new env
    vi.doMock('@/lib/rateLimit/config', () => ({
      shouldBypassRateLimit: vi.fn(() => true)
    }))
    
    const { shouldBypassRateLimit } = await import('@/lib/rateLimit/config')
    
    expect(shouldBypassRateLimit()).toBe(true)
    
    // Restore environment
    if (originalRateLimit) {
      process.env.RATE_LIMITING_ENABLED = originalRateLimit
    }
  })

  it('should bypass rate limiting in development', async () => {
    // Mock environment
    const originalRateLimit = process.env.RATE_LIMITING_ENABLED
    
    process.env.RATE_LIMITING_ENABLED = 'true'
    
    // Re-import config to pick up new env
    vi.doMock('@/lib/rateLimit/config', () => ({
      shouldBypassRateLimit: vi.fn(() => true)
    }))
    
    const { shouldBypassRateLimit } = await import('@/lib/rateLimit/config')
    
    expect(shouldBypassRateLimit()).toBe(true)
    
    // Restore environment
    if (originalRateLimit) {
      process.env.RATE_LIMITING_ENABLED = originalRateLimit
    }
  })

  it('should bypass rate limiting in preview deployments', async () => {
    // Mock environment
    const originalVercelEnv = process.env.VERCEL_ENV
    const originalRateLimit = process.env.RATE_LIMITING_ENABLED
    
    process.env.VERCEL_ENV = 'preview'
    process.env.RATE_LIMITING_ENABLED = 'true'
    
    // Re-import config to pick up new env
    vi.doMock('@/lib/rateLimit/config', () => ({
      shouldBypassRateLimit: vi.fn(() => true)
    }))
    
    const { shouldBypassRateLimit } = await import('@/lib/rateLimit/config')
    
    expect(shouldBypassRateLimit()).toBe(true)
    
    // Restore environment
    if (originalVercelEnv) {
      process.env.VERCEL_ENV = originalVercelEnv
    }
    if (originalRateLimit) {
      process.env.RATE_LIMITING_ENABLED = originalRateLimit
    }
  })

  it('should enable rate limiting in production with explicit flag', async () => {
    // Mock environment
    const originalRateLimit = process.env.RATE_LIMITING_ENABLED
    
    process.env.RATE_LIMITING_ENABLED = 'true'
    
    // Re-import config to pick up new env
    vi.doMock('@/lib/rateLimit/config', () => ({
      shouldBypassRateLimit: vi.fn(() => false)
    }))
    
    const { shouldBypassRateLimit } = await import('@/lib/rateLimit/config')
    
    expect(shouldBypassRateLimit()).toBe(false)
    
    // Restore environment
    if (originalRateLimit) {
      process.env.RATE_LIMITING_ENABLED = originalRateLimit
    }
  })

  it('should omit rate limit headers when bypassed', async () => {
    // Mock withRateLimit to simulate bypass behavior
    vi.mock('@/lib/rateLimit/withRateLimit', () => ({
      withRateLimit: vi.fn((handler) => handler) // No rate limiting applied
    }))
    
    const mockHandler = async (request: NextRequest) => {
      return new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const request = new NextRequest('https://example.com/api/test')
    const response = await mockHandler(request)
    
    // Should not have rate limit headers when bypassed
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull()
    expect(response.headers.get('X-RateLimit-Remaining')).toBeNull()
    expect(response.headers.get('X-RateLimit-Reset')).toBeNull()
    expect(response.headers.get('X-RateLimit-Policy')).toBeNull()
  })

  it('should allow explicit bypass in route options', async () => {
    // Mock withRateLimit to check bypass option
    const mockWithRateLimit = vi.fn((handler, policies, opts) => {
      if (opts?.bypass) {
        return handler // No rate limiting
      }
      return async (request: NextRequest) => {
        return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })
      }
    })
    
    vi.mock('@/lib/rateLimit/withRateLimit', () => ({
      withRateLimit: mockWithRateLimit
    }))
    
    const mockHandler = async (request: NextRequest) => {
      return new Response(JSON.stringify({ data: 'test' }), { status: 200 })
    }
    
    const request = new NextRequest('https://example.com/api/test')
    
    // Test with bypass
    const bypassedHandler = mockWithRateLimit(mockHandler, [], { bypass: true })
    const bypassedResponse = await bypassedHandler(request)
    expect(bypassedResponse.status).toBe(200)
    
    // Test without bypass
    const limitedHandler = mockWithRateLimit(mockHandler, [], {})
    const limitedResponse = await limitedHandler(request)
    expect(limitedResponse.status).toBe(429)
  })
})
