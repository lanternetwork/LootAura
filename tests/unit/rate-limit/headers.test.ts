/**
 * Rate Limiting Tests - Headers
 * 
 * Tests that proper rate limiting headers are applied to responses.
 */

import { describe, it, expect } from 'vitest'
import { applyRateHeaders } from '@/lib/rateLimit/headers'
import { Policies } from '@/lib/rateLimit/policies'

describe('Rate Limiting - Headers', () => {
  it('should apply standard headers on success', () => {
    const response = new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    
    const policy = Policies.AUTH_DEFAULT
    const remaining = 3
    const resetAt = Math.floor(Date.now() / 1000) + 30
    const softLimited = false
    
    const result = applyRateHeaders(response, policy, remaining, resetAt, softLimited)
    
    expect(result.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(result.headers.get('X-RateLimit-Remaining')).toBe('3')
    expect(result.headers.get('X-RateLimit-Reset')).toBe(resetAt.toString())
    expect(result.headers.get('X-RateLimit-Policy')).toBe('AUTH_DEFAULT 5/30')
    expect(result.headers.get('Retry-After')).toBeNull()
  })

  it('should apply Retry-After on hard limit', () => {
    const response = new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    })
    
    const policy = Policies.AUTH_DEFAULT
    const remaining = 0
    const resetAt = Math.floor(Date.now() / 1000) + 30
    const softLimited = false
    
    const result = applyRateHeaders(response, policy, remaining, resetAt, softLimited)
    
    expect(result.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(result.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(result.headers.get('X-RateLimit-Reset')).toBe(resetAt.toString())
    expect(result.headers.get('X-RateLimit-Policy')).toBe('AUTH_DEFAULT 5/30')
    expect(result.headers.get('Retry-After')).toBe('30')
  })

  it('should not apply Retry-After on soft limit', () => {
    const response = new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    
    const policy = Policies.SALES_VIEW_30S
    const remaining = 0
    const resetAt = Math.floor(Date.now() / 1000) + 30
    const softLimited = true
    
    const result = applyRateHeaders(response, policy, remaining, resetAt, softLimited)
    
    expect(result.headers.get('X-RateLimit-Limit')).toBe('20')
    expect(result.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(result.headers.get('X-RateLimit-Reset')).toBe(resetAt.toString())
    expect(result.headers.get('X-RateLimit-Policy')).toBe('SALES_VIEW_30S 20/30')
    expect(result.headers.get('Retry-After')).toBeNull()
  })

  it('should preserve existing headers', () => {
    const response = new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Custom-Header': 'custom-value'
      }
    })
    
    const policy = Policies.AUTH_DEFAULT
    const remaining = 2
    const resetAt = Math.floor(Date.now() / 1000) + 30
    const softLimited = false
    
    const result = applyRateHeaders(response, policy, remaining, resetAt, softLimited)
    
    expect(result.headers.get('Content-Type')).toBe('application/json')
    expect(result.headers.get('Custom-Header')).toBe('custom-value')
    expect(result.headers.get('X-RateLimit-Limit')).toBe('5')
  })

  it('should calculate minimum Retry-After of 1 second', () => {
    const response = new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    })
    
    const policy = Policies.AUTH_DEFAULT
    const remaining = 0
    const resetAt = Math.floor(Date.now() / 1000) + 1 // 1 second from now
    const softLimited = false
    
    const result = applyRateHeaders(response, policy, remaining, resetAt, softLimited)
    
    expect(result.headers.get('Retry-After')).toBe('1')
  })
})
