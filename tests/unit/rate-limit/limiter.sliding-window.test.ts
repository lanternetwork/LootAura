/**
 * Rate Limiting Tests - Sliding Window Behavior
 * 
 * Tests the core sliding window rate limiting logic with soft-then-hard behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { check } from '@/lib/rateLimit/limiter'
import { Policies } from '@/lib/rateLimit/policies'
import * as store from '@/lib/rateLimit/store'

// Mock the store module
vi.mock('@/lib/rateLimit/store', () => ({
  incrAndGet: vi.fn(),
  now: vi.fn(() => Math.floor(Date.now() / 1000))
}))

const mockStore = store as any

describe('Rate Limiting - Sliding Window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should allow requests within limit', async () => {
    const policy = Policies.AUTH_DEFAULT // 5 requests per 30 seconds
    const key = 'test-key'
    
    // Mock store to return count within limit
    mockStore.incrAndGet.mockResolvedValue({
      count: 3,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    
    const result = await check(policy, key)
    
    expect(result.allowed).toBe(true)
    expect(result.softLimited).toBe(false)
    expect(result.remaining).toBe(2) // 5 - 3
  })

  it('should block requests over hard limit', async () => {
    const policy = Policies.AUTH_DEFAULT // 5 requests per 30 seconds
    const key = 'test-key'
    
    // Mock store to return count over limit
    mockStore.incrAndGet.mockResolvedValue({
      count: 6,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    
    const result = await check(policy, key)
    
    expect(result.allowed).toBe(false)
    expect(result.softLimited).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('should allow soft-limited requests within burst', async () => {
    const policy = Policies.SALES_VIEW_30S // 20 requests per 30s, burstSoft: 2, softWindowSec: 5
    const key = 'test-key'
    
    // Mock store to return count over limit
    mockStore.incrAndGet.mockResolvedValue({
      count: 21,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    
    // Mock soft window check to return within burst
    mockStore.incrAndGet.mockResolvedValueOnce({
      count: 21,
      resetAt: Math.floor(Date.now() / 1000) + 30
    }).mockResolvedValueOnce({
      count: 1, // Within burstSoft limit of 2
      resetAt: Math.floor(Date.now() / 1000) + 5
    })
    
    const result = await check(policy, key)
    
    expect(result.allowed).toBe(true)
    expect(result.softLimited).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('should block requests over burst limit', async () => {
    const policy = Policies.SALES_VIEW_30S // 20 requests per 30s, burstSoft: 2, softWindowSec: 5
    const key = 'test-key'
    
    // Mock store to return count over limit
    mockStore.incrAndGet.mockResolvedValue({
      count: 21,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    
    // Mock soft window check to return over burst
    mockStore.incrAndGet.mockResolvedValueOnce({
      count: 21,
      resetAt: Math.floor(Date.now() / 1000) + 30
    }).mockResolvedValueOnce({
      count: 3, // Over burstSoft limit of 2
      resetAt: Math.floor(Date.now() / 1000) + 5
    })
    
    const result = await check(policy, key)
    
    expect(result.allowed).toBe(false)
    expect(result.softLimited).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('should reset after window expires', async () => {
    const policy = Policies.AUTH_DEFAULT // 5 requests per 30 seconds
    const key = 'test-key'
    
    // Mock store to return expired window (count resets)
    mockStore.incrAndGet.mockResolvedValue({
      count: 1,
      resetAt: Math.floor(Date.now() / 1000) + 30
    })
    
    const result = await check(policy, key)
    
    expect(result.allowed).toBe(true)
    expect(result.softLimited).toBe(false)
    expect(result.remaining).toBe(4) // 5 - 1
  })
})
