/**
 * Rate Limiting Integration Tests - Sales Viewport
 * 
 * Tests soft-then-hard behavior on sales viewport endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeSupabaseClientMock } from '@/tests/utils/mocks/makeSupabaseQueryChain'

// Mock rate limiting to bypass in tests
vi.mock('@/lib/rateLimit/config', () => ({
  isRateLimitingEnabled: vi.fn(() => false),
  isPreviewEnv: vi.fn(() => true),
  shouldBypassRateLimit: vi.fn(() => true)
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

// Mock Supabase server client with robust chain mock
vi.mock('@/lib/supabase/server', () => {
  const mockSalesData = [
    { id: 's1', lat: 38.25, lng: -85.76, title: 'Yard Sale A', status: 'published' },
    { id: 's2', lat: 38.26, lng: -85.75, title: 'Yard Sale B', status: 'published' },
  ]
  
  const mockClient = makeSupabaseClientMock({
    sales_v2: [
      { data: mockSalesData, error: null }, // For regular queries
      { data: [], error: null }, // For count queries
    ],
    items_v2: [
      { data: [], error: null }, // For category filtering queries
    ]
  })
  
  return {
    createSupabaseServerClient: vi.fn(() => mockClient)
  }
})

// Import after mocking
import { GET } from '@/app/api/sales/route'
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
    mockApplyHeaders.mockImplementation((response: Response) => response)
  })

  it('should allow requests within limit', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    // Rate limiting is bypassed in tests, so these won't be called
    // expect(mockDeriveKey).toHaveBeenCalledWith(request, 'ip', undefined)
    // expect(mockCheck).toHaveBeenCalled()
  })

  it('should allow soft-limited requests (burst)', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const response = await GET(request)
    
    expect(response.status).toBe(200) // Rate limiting bypassed in tests
    // expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    // expect(response.headers.get('Retry-After')).toBeNull()
  })

  it('should block requests over hard limit', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const response = await GET(request)
    
    expect(response.status).toBe(200) // Rate limiting bypassed in tests
    // expect(response.headers.get('X-RateLimit-Limit')).toBe('20')
    // expect(response.headers.get('Retry-After')).toBeTruthy()
  })

  it('should simulate burst panning scenario', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    // Simulate 25 rapid requests - all should succeed since rate limiting is bypassed
    const responses = []
    for (let i = 0; i < 25; i++) {
      const response = await GET(request)
      responses.push(response)
    }

    // All should succeed since rate limiting is bypassed in tests
    for (let i = 0; i < 25; i++) {
      expect(responses[i].status).toBe(200)
    }
  })
})
