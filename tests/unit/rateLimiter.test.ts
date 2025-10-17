import { describe, it, expect, beforeEach } from 'vitest'
import { createRateLimitMiddleware, RATE_LIMITS, checkRateLimit } from '@/lib/rateLimiter'

describe('RateLimiter (in-memory)', () => {
  beforeEach(() => {
    // nothing to reset explicitly; window-based counters will naturally expire
  })

  it('allows requests within limit', () => {
    const key = 'unit:within-limit'
    const limit = 3
    const windowMs = 1000

    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
  })

  it('blocks after exceeding limit', () => {
    const key = 'unit:exceed-limit'
    const limit = 2
    const windowMs = 1000

    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs)).toBe(false)
  })

  it('middleware enforces limits per IP', () => {
    const middleware = createRateLimitMiddleware({
      limit: 2,
      windowMs: 1000,
      keyGenerator: (request: Request) => {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        return `test:${ip}`
      },
    })

    const req = new Request('https://example.com/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })

    expect(middleware(req).allowed).toBe(true)
    expect(middleware(req).allowed).toBe(true)
    expect(middleware(req).allowed).toBe(false)
  })

  it('uses custom key generator', () => {
    const middleware = createRateLimitMiddleware({
      limit: 1,
      windowMs: 1000,
      keyGenerator: (_req: Request) => 'custom-key',
    })

    const req = new Request('https://example.com/api/test')
    expect(middleware(req).allowed).toBe(true)
    expect(middleware(req).allowed).toBe(false)
  })

  it('treats different IPs separately', () => {
    const middleware = createRateLimitMiddleware({
      limit: 1,
      windowMs: 1000,
      keyGenerator: (request: Request) => {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        return `per-ip:${ip}`
      },
    })

    const req1 = new Request('https://example.com/api/test', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })
    const req2 = new Request('https://example.com/api/test', {
      headers: { 'x-forwarded-for': '10.0.0.2' },
    })

    expect(middleware(req1).allowed).toBe(true)
    expect(middleware(req2).allowed).toBe(true)
  })

  it('has expected RATE_LIMITS defaults', () => {
    expect(RATE_LIMITS.AUTH.limit).toBe(10)
    expect(RATE_LIMITS.AUTH.windowMs).toBe(15 * 60 * 1000)
    expect(RATE_LIMITS.UPLOAD_SIGNER.limit).toBe(5)
    expect(RATE_LIMITS.UPLOAD_SIGNER.windowMs).toBe(60 * 1000)
  })
})
