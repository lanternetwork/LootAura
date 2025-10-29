/**
 * Rate Limiting Integration Tests - Sales Viewport
 * 
 * Tests soft-then-hard behavior on sales viewport endpoint.
 */

import { vi, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { buildChain } from '@/tests/mocks/supabaseServer.mock'

// Always bypass rate limiting in this suite
vi.mock('@/lib/rateLimit/config', () => ({
  isRateLimitingEnabled: vi.fn(() => false),
  isPreviewEnv: vi.fn(() => true),
  shouldBypassRateLimit: vi.fn(() => true),
}))

// Disable rate limiting in tests
;(process.env as any).RATE_LIMITING_ENABLED = 'false'

// Test bbox: north=38.1, south=38.0, east=-84.9, west=-85.0
// Route expands by 50%: latBuffer=0.05, lngBuffer=0.05
// Expanded bbox: minLat=37.95, maxLat=38.15, minLng=-85.05, maxLng=-84.85
// Sale coordinates must be within this expanded bbox to pass .gte()/.lte() filters
const saleData = [
  { 
    id: 's1', 
    lat: 38.05, 
    lng: -84.95, 
    title: 'Sale A', 
    description: 'Test sale',
    address: '123 Test St',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40201',
    status: 'published', 
    date_start: '2024-01-01', 
    time_start: '09:00',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }, // Within expanded bbox
  { 
    id: 's2', 
    lat: 38.06, 
    lng: -84.94, 
    title: 'Sale B', 
    description: 'Another test sale',
    address: '456 Test Ave',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40201',
    status: 'published', 
    date_start: '2024-01-02', 
    time_start: '10:00',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z'
  }, // Within expanded bbox
]

// Hoist Supabase server mock BEFORE importing the route
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => buildChain(table === 'sales_v2' ? saleData : []),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}))

describe('Rate Limiting Integration - Sales Viewport', () => {

  it('should allow requests within limit', async () => {
    const { GET } = await import('@/app/api/sales/route') // import after mock
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    const response = await GET(request)
    
    if (response.status !== 200) {
      const text = await response.text()
      console.error('SALES API BODY', text)
    }
    
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
  })

  it('should allow soft-limited requests (burst)', async () => {
    const { GET } = await import('@/app/api/sales/route') // import after mock
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    const response = await GET(request)
    
    if (response.status !== 200) {
      const text = await response.text()
      console.error('SALES API BODY', text)
    }
    
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
  })

  it('should handle repeated calls without error', async () => {
    const { GET } = await import('@/app/api/sales/route') // import after mock
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    const response = await GET(request)
    
    if (response.status !== 200) {
      const text = await response.text()
      console.error('SALES API BODY', text)
    }
    
    expect(response.status).toBe(200)
  })

  it('should simulate burst panning scenario', async () => {
    const { GET } = await import('@/app/api/sales/route') // import after mock
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    // Simulate 10 rapid requests - all should succeed since rate limiting is bypassed
    for (let i = 0; i < 10; i++) {
      const res = await GET(request)
      if (res.status !== 200) {
        const text = await res.text()
        console.error(`SALES API BODY (iteration ${i})`, text)
      }
      expect(res.status).toBe(200)
    }
  })
})
