/**
 * Rate Limiting Tests - Key Derivation
 * 
 * Tests key derivation logic for different scopes and user contexts.
 */

import { describe, it, expect, vi } from 'vitest'
import { deriveKey } from '@/lib/rateLimit/keys'

// Mock NextRequest
const createMockRequest = (
  headers: Record<string, string> = {},
  method: string = 'GET',
  pathname: string = '/api/test'
) => ({
  method,
  nextUrl: {
    pathname
  },
  url: `https://example.com${pathname}`,
  headers: {
    get: (name: string) => headers[name.toLowerCase()] || null
  }
}) as any

describe('Rate Limiting - Key Derivation', () => {
  it('should derive IP key from x-forwarded-for', async () => {
    const request = createMockRequest({
      'x-forwarded-for': '192.168.1.1, 10.0.0.1'
    })
    
    const key = await deriveKey(request, 'ip')
    
    expect(key).toBe('ip:192.168.1.1:GET:/api/test')
  })

  it('should derive IP key from x-real-ip when x-forwarded-for missing', async () => {
    const request = createMockRequest({
      'x-real-ip': '203.0.113.1'
    })
    
    const key = await deriveKey(request, 'ip')
    
    expect(key).toBe('ip:203.0.113.1:GET:/api/test')
  })

  it('should fallback to cf-connecting-ip', async () => {
    const request = createMockRequest({
      'cf-connecting-ip': '198.51.100.1'
    })
    
    const key = await deriveKey(request, 'ip')
    
    expect(key).toBe('ip:198.51.100.1:GET:/api/test')
  })

  it('should fallback to unknown when no IP headers', async () => {
    const request = createMockRequest({})
    
    const key = await deriveKey(request, 'ip')
    
    expect(key).toBe('ip:unknown:GET:/api/test')
  })

  it('should derive user key when userId provided', async () => {
    const request = createMockRequest({
      'x-forwarded-for': '192.168.1.1'
    })
    
    const key = await deriveKey(request, 'user', 'user123')
    
    expect(key).toBe('user:user123:GET:/api/test')
  })

  it('should fallback to IP for user scope when no userId', async () => {
    const request = createMockRequest({
      'x-forwarded-for': '192.168.1.1'
    })
    
    const key = await deriveKey(request, 'user')
    
    expect(key).toBe('ip:192.168.1.1:GET:/api/test')
  })

  it('should force IP for ip-auth scope even with userId', async () => {
    const request = createMockRequest({
      'x-forwarded-for': '192.168.1.1'
    })
    
    const key = await deriveKey(request, 'ip-auth', 'user123')
    
    expect(key).toBe('ip:192.168.1.1:GET:/api/test')
  })

  it('should handle comma-separated x-forwarded-for correctly', async () => {
    const request = createMockRequest({
      'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178'
    })
    
    const key = await deriveKey(request, 'ip')
    
    expect(key).toBe('ip:203.0.113.195:GET:/api/test')
  })

  it('should trim whitespace from IP addresses', async () => {
    const request = createMockRequest({
      'x-forwarded-for': '  192.168.1.1  , 10.0.0.1'
    })
    
    const key = await deriveKey(request, 'ip')
    
    expect(key).toBe('ip:192.168.1.1:GET:/api/test')
  })

  it('should include HTTP method in key', async () => {
    const request = createMockRequest({}, 'POST', '/api/drafts')
    
    const key = await deriveKey(request, 'ip')
    
    expect(key).toBe('ip:unknown:POST:/api/drafts')
  })

  it('should include pathname in key', async () => {
    const request = createMockRequest({}, 'GET', '/api/sales')
    
    const key = await deriveKey(request, 'user', 'user123')
    
    expect(key).toBe('user:user123:GET:/api/sales')
  })
})
