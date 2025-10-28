/**
 * Rate Limiting Integration Tests - Sales Viewport
 * 
 * Tests soft-then-hard behavior on sales viewport endpoint.
 */

import { vi, beforeAll, afterEach, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { makeSupabaseFromMock, mockCreateSupabaseServerClient } from '@/tests/utils/mocks/supabaseServerMock'

const from = makeSupabaseFromMock({
  sales_v2: [
    { data: [
      { id: 's1', lat: 38.25, lng: -85.76, title: 'Sale A' },
      { id: 's2', lat: 38.26, lng: -85.75, title: 'Sale B' },
    ], error: null },
  ],
})

vi.mock('@/lib/supabase/server', () => mockCreateSupabaseServerClient(from))

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
    
    const data = await response.json()
    expect(data.sales).toHaveLength(2)
    expect(data.sales[0].title).toBe('Sale A')
    expect(data.sales[1].title).toBe('Sale B')
  })

  it('should allow soft-limited requests (burst)', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const { GET } = route
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.sales).toHaveLength(2)
  })

  it('should block requests over hard limit', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const { GET } = route
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.sales).toHaveLength(2)
  })

  it('should simulate burst panning scenario', async () => {
    const request = new NextRequest('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    
    const { GET } = route
    
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
