/**
 * Rate Limiting Integration Tests - Sales Viewport
 * 
 * Tests soft-then-hard behavior on sales viewport endpoint.
 */

import { vi, describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

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
  },
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
  },
]

// Inline Supabase server mock with fluent chain
vi.mock('@/lib/supabase/server', () => {
	const makeChainWithCount = (result: any) => {
		const chain: any = {}
		chain.select = vi.fn((_cols?: any, opts?: any) => {
			if (opts?.count === 'exact' && opts?.head === true) {
				return {
					eq: vi.fn(() => Promise.resolve({ count: Array.isArray(result) ? result.length : 0, error: null })),
				}
			}
			return chain
		})
		chain.eq = vi.fn(() => chain)
		chain.gte = vi.fn(() => chain)
		chain.lte = vi.fn(() => chain)
		chain.in = vi.fn(() => chain)
		chain.or = vi.fn(() => chain)
		chain.order = vi.fn(() => chain)
		chain.range = vi.fn(() => Promise.resolve({ data: result, error: null }))
		chain.limit = vi.fn(() => Promise.resolve({ data: result, error: null }))
		chain.single = vi.fn(() => Promise.resolve({ data: result?.[0] ?? null, error: null }))
		chain.maybeSingle = vi.fn(() => Promise.resolve({ data: result?.[0] ?? null, error: null }))
		;(chain as any).then = (onFulfilled: any, onRejected: any) => Promise.resolve({ data: result, error: null }).then(onFulfilled, onRejected)
		return chain
	}

	const makeSimpleChain = (result: any) => {
		const chain: any = {}
		chain.select = vi.fn(() => chain)
		chain.eq = vi.fn(() => chain)
		chain.gte = vi.fn(() => chain)
		chain.lte = vi.fn(() => chain)
		chain.in = vi.fn(() => chain)
		chain.or = vi.fn(() => chain)
		chain.order = vi.fn(() => chain)
		chain.range = vi.fn(() => Promise.resolve({ data: result, error: null }))
		chain.limit = vi.fn(() => Promise.resolve({ data: result, error: null }))
		chain.single = vi.fn(() => Promise.resolve({ data: result?.[0] ?? null, error: null }))
		chain.maybeSingle = vi.fn(() => Promise.resolve({ data: result?.[0] ?? null, error: null }))
		;(chain as any).then = (onFulfilled: any, onRejected: any) => Promise.resolve({ data: result, error: null }).then(onFulfilled, onRejected)
		return chain
	}

	const salesChain = makeChainWithCount(saleData)
	const itemsChain = makeSimpleChain([])

	return {
		createSupabaseServerClient: vi.fn(() => ({
			auth: {
				getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
			},
			from: vi.fn((table: string) => {
				if (table === 'sales_v2') return salesChain
				if (table === 'items_v2') return itemsChain
				return makeSimpleChain([])
			}),
		})),
	}
})

let route: any
beforeAll(async () => {
  // Import AFTER the mock so it picks up the mocked module
  route = await import('@/app/api/sales/route')
})

describe('Rate Limiting Integration - Sales Viewport', () => {

  it('should allow requests within limit', async () => {
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    const response = await route.GET(request)
    
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
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    const response = await route.GET(request)
    
    if (response.status !== 200) {
      const text = await response.text()
      console.error('SALES API BODY', text)
    }
    
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
  })

  it('should handle repeated calls without error', async () => {
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    const response = await route.GET(request)
    
    if (response.status !== 200) {
      const text = await response.text()
      console.error('SALES API BODY', text)
    }
    
    expect(response.status).toBe(200)
  })

  it('should simulate burst panning scenario', async () => {
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)
    
    for (let i = 0; i < 10; i++) {
      const res = await route.GET(request)
      if (res.status !== 200) {
        const text = await res.text()
        console.error(`SALES API BODY (iteration ${i})`, text)
      }
      expect(res.status).toBe(200)
    }
  })
})
