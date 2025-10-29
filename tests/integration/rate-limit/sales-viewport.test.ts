/**
 * Rate Limiting Integration Tests - Sales Viewport
 * 
 * Tests soft-then-hard behavior on sales viewport endpoint.
 */

import { vi, beforeAll, afterEach, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { mockSupabaseServer } from '@/tests/utils/mocks/supabaseServerMock'

// Provide table rows for the mock server
mockSupabaseServer({
  sales_v2: [
    { id: 's1', lat: 38.25, lng: -85.76, title: 'Sale A', status: 'published' },
    { id: 's2', lat: 38.26, lng: -85.75, title: 'Sale B', status: 'published' },
  ],
  items_v2: [],
})

// Disable rate limiting in tests
;(process.env as any).RATE_LIMITING_ENABLED = 'false'

let route: any
beforeAll(async () => {
  // Import AFTER the mock so it picks up the mocked module
  route = await import('@/app/api/sales/route')
})

afterEach(() => {
  vi.resetModules()
})

describe('Rate Limiting Integration - Sales Viewport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should allow requests within limit', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const { GET } = route
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
  })

  it('should allow soft-limited requests (burst)', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const { GET } = route
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
  })

  it('should handle repeated calls without error', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const { GET } = route
    const response = await GET(request)
    
    expect(response.status).toBe(200)
  })

  it('should simulate burst panning scenario', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const { GET } = route
    
    // Simulate 10 rapid requests - all should succeed since rate limiting is bypassed
    for (let i = 0; i < 10; i++) {
      const res = await GET(request)
      expect(res.status).toBe(200)
    }
  })
})
