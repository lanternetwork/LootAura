/**
 * Rate Limiting Integration Tests - Sales Viewport
 * 
 * Tests soft-then-hard behavior on sales viewport endpoint.
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
import { salesHandler } from '@/app/api/sales/route'
import { check } from '@/lib/rateLimit/limiter'
import { deriveKey } from '@/lib/rateLimit/keys'
import { applyRateHeaders } from '@/lib/rateLimit/headers'

const mockCheck = check as any
const mockDeriveKey = deriveKey as any
const mockApplyHeaders = applyRateHeaders as any

describe('Rate Limiting Integration - Sales Viewport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default successful mocks
    mockDeriveKey.mockResolvedValue('ip:192.168.1.1')
    mockCheck.mockResolvedValue({
      allowed: true,
      softLimited: false,
      remaining: 15,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    mockApplyHeaders.mockImplementation((response) => response)
  })

  it('should allow requests within limit', async () => {
    const request = new NextRequest('https://example.com/api/sales?bbox=38.0,-85.0,38.1,-84.9')
    
    // Mock successful sales fetch
    vi.mock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(() => ({
                gte: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      lte: vi.fn(() => ({
                        order: vi.fn(() => ({
                          limit: vi.fn().mockResolvedValue({
                            data: [],
                            error: null
                          })
                        }))
                      }))
                    }))
                  }))
                }))
              }))
            }))
          }))
        }))
      }))
    }))
    
    const response = await salesHandler(request)
    
    expect(response.status).toBe(200)
    expect(mockDeriveKey).toHaveBeenCalledWith(request, 'ip', undefined)
    expect(mockCheck).toHaveBeenCalled()
  })

  it('should allow soft-limited requests (burst)', async () => {
    mockCheck.mockResolvedValue({
      allowed: true,
      softLimited: true,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    
    const request = new NextRequest('https://example.com/api/sales?bbox=38.0,-85.0,38.1,-84.9')
    
    // Mock successful sales fetch
    vi.mock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(() => ({
                gte: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      lte: vi.fn(() => ({
                        order: vi.fn(() => ({
                          limit: vi.fn().mockResolvedValue({
                            data: [],
                            error: null
                          })
                        }))
                      }))
                    }))
                  }))
                }))
              }))
            }))
          }))
        }))
      }))
    }))
    
    const response = await salesHandler(request)
    
    expect(response.status).toBe(200) // Still succeeds
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(response.headers.get('Retry-After')).toBeNull() // No Retry-After on soft limit
  })

  it('should block requests over hard limit', async () => {
    mockCheck.mockResolvedValue({
      allowed: false,
      softLimited: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    
    const request = new NextRequest('https://example.com/api/sales?bbox=38.0,-85.0,38.1,-84.9')
    
    const response = await salesHandler(request)
    
    expect(response.status).toBe(429)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('20')
    expect(response.headers.get('Retry-After')).toBeTruthy()
  })

  it('should simulate burst panning scenario', async () => {
    const request = new NextRequest('https://example.com/api/sales?bbox=38.0,-85.0,38.1,-84.9')
    
    // Mock successful sales fetch
    vi.mock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(() => ({
                gte: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      lte: vi.fn(() => ({
                        order: vi.fn(() => ({
                          limit: vi.fn().mockResolvedValue({
                            data: [],
                            error: null
                          })
                        }))
                      }))
                    }))
                  }))
                }))
              }))
            }))
          }))
        }))
      }))
    }))
    
    // Simulate 25 rapid requests
    const responses = []
    for (let i = 0; i < 25; i++) {
      if (i < 20) {
        // First 20 requests succeed
        mockCheck.mockResolvedValue({
          allowed: true,
          softLimited: false,
          remaining: 20 - i - 1,
          resetAt: Math.floor(Date.now() / 1000) + 30
        })
      } else if (i < 22) {
        // Next 2 requests are soft-limited
        mockCheck.mockResolvedValue({
          allowed: true,
          softLimited: true,
          remaining: 0,
          resetAt: Math.floor(Date.now() / 1000) + 30
        })
      } else {
        // Remaining requests are hard-blocked
        mockCheck.mockResolvedValue({
          allowed: false,
          softLimited: false,
          remaining: 0,
          resetAt: Math.floor(Date.now() / 1000) + 30
        })
      }
      
      const response = await salesHandler(request)
      responses.push(response)
    }
    
    // First 20 should succeed
    for (let i = 0; i < 20; i++) {
      expect(responses[i].status).toBe(200)
    }
    
    // Next 2 should succeed but be soft-limited
    expect(responses[20].status).toBe(200)
    expect(responses[21].status).toBe(200)
    
    // Remaining should be blocked
    for (let i = 22; i < 25; i++) {
      expect(responses[i].status).toBe(429)
    }
  })
})
