import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateLimit, createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear any existing rate limit data
    vi.clearAllTimers()
  })

  it('should allow requests within limit', () => {
    const key = 'test-key'
    const limit = 3
    const windowMs = 60000 // 1 minute

    // First 3 requests should be allowed
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
  })

  it('should block requests after limit exceeded', () => {
    const key = 'test-key-2'
    const limit = 2
    const windowMs = 60000 // 1 minute

    // First 2 requests should be allowed
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    
    // Third request should be blocked
    expect(checkRateLimit(key, limit, windowMs)).toBe(false)
  })

  it('should reset after window expires', () => {
    const key = 'test-key-3'
    const limit = 1
    const windowMs = 100 // Very short window

    // First request should be allowed
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    
    // Second request should be blocked
    expect(checkRateLimit(key, limit, windowMs)).toBe(false)
    
    // Wait for window to expire
    vi.advanceTimersByTime(windowMs + 1)
    
    // Request should be allowed again
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
  })

  it('should create middleware that blocks after limit', () => {
    const middleware = createRateLimitMiddleware({
      limit: 2,
      windowMs: 60000,
      keyGenerator: () => 'test-key-4'
    })

    const mockRequest = new Request('http://localhost:3000/test')

    // First 2 requests should be allowed
    expect(middleware(mockRequest).allowed).toBe(true)
    expect(middleware(mockRequest).allowed).toBe(true)
    
    // Third request should be blocked
    const result = middleware(mockRequest)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe('Too many requests. Please try again later.')
  })

  it('should use different keys for different requests', () => {
    const middleware = createRateLimitMiddleware({
      limit: 1,
      windowMs: 60000,
      keyGenerator: (request) => `key-${request.url}`
    })

    const request1 = new Request('http://localhost:3000/test1')
    const request2 = new Request('http://localhost:3000/test2')

    // Both should be allowed since they have different keys
    expect(middleware(request1).allowed).toBe(true)
    expect(middleware(request2).allowed).toBe(true)
  })

  it('should have correct rate limit configurations', () => {
    expect(RATE_LIMITS.AUTH.limit).toBe(10)
    expect(RATE_LIMITS.AUTH.windowMs).toBe(15 * 60 * 1000) // 15 minutes
    
    expect(RATE_LIMITS.UPLOAD_SIGNER.limit).toBe(5)
    expect(RATE_LIMITS.UPLOAD_SIGNER.windowMs).toBe(60 * 1000) // 1 minute
  })
})
