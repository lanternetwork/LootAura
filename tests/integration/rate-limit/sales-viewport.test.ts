/**
 * Rate Limiting Integration Tests - Sales Viewport
 *
 * Mocks Supabase server client to always succeed with a count and two fake rows,
 * then dynamically imports the route and asserts a successful 200 response.
 */

import { vi, describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Bypass rate limiting entirely in tests
vi.mock('@/lib/rateLimit/config', () => ({
  isRateLimitingEnabled: vi.fn(() => false),
  isPreviewEnv: vi.fn(() => true),
  shouldBypassRateLimit: vi.fn(() => true),
}))

// Ensure HOF is a no-op to simplify testing
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler,
}))

// Two fake sales that lie inside the expanded bbox used by the route
const FAKE_SALES = [
  { id: 's1', lat: 38.05, lng: -84.95, title: 'Sale A', status: 'published' },
  { id: 's2', lat: 38.06, lng: -84.94, title: 'Sale B', status: 'published' },
]

// Mock Supabase server: support the two patterns required by the route
vi.mock('@/lib/supabase/server', () => {
  function createCountChain() {
    return {
      eq: vi.fn(() => Promise.resolve({ count: 2, error: null })),
    }
  }

  function createDataChain() {
    const chain: any = {}
    chain.gte = vi.fn(() => chain)
    chain.lte = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.range = vi.fn(() => Promise.resolve({ data: FAKE_SALES, error: null }))
    chain.eq = vi.fn(() => chain)
    chain.in = vi.fn(() => chain)
    chain.or = vi.fn(() => chain)
    return chain
  }

  const from = vi.fn((table: string) => {
    return {
      select: vi.fn((columns?: string | string[], options?: any) => {
        if (options?.count === 'exact' && options?.head === true) {
          // Pattern: from('sales_v2').select('*', { count: 'exact', head: true }).eq(...)
          return createCountChain()
        }
        // Pattern: from('sales_v2').select('*').gte(...).lte(...).order(...).range(...)
        return createDataChain()
      }),
    }
  })

  return {
    createSupabaseServerClient: vi.fn(() => ({
      from,
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      },
    })),
  }
})

;(process.env as any).RATE_LIMITING_ENABLED = 'false'

let route: any
beforeAll(async () => {
  route = await import('@/app/api/sales/route')
})

describe('Rate Limiting Integration - Sales Viewport', () => {
  it('returns 200 and two results within bbox', async () => {
    const url = new URL('https://example.com/api/sales?north=38.1&south=38.0&east=-84.9&west=-85.0')
    const request = new NextRequest(url)

    const response = await route.GET(request)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBe(2)
  })
})
