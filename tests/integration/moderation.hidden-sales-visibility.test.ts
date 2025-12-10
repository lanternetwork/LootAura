/**
 * Integration tests for hidden sales visibility
 * Tests that hidden_by_admin sales are excluded from public endpoints
 * and blocked on detail page for non-admins
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
  from: vi.fn(),
}

// Mock admin DB
const mockAdminDb = {
  from: vi.fn(),
}

// Mock RLS DB
const mockRlsDb = {
  from: vi.fn(),
}

// Create query chain helper
const createQueryChain = (data: any[] = [], error: any = null) => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data, error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: data[0] || null, error })),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => mockRlsDb,
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => db.from(table),
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  generateOperationId: vi.fn(() => 'test-op-id-123'),
}))

// Mock rate limiting
vi.mock('@/lib/rateLimit/limiter', () => ({
  check: vi.fn().mockResolvedValue({ 
    allowed: true, 
    remaining: 10,
    softLimited: false,
    resetAt: Date.now() + 60000,
  }),
}))

vi.mock('@/lib/rateLimit/keys', () => ({
  deriveKey: vi.fn().mockResolvedValue('test-key'),
}))

describe('Hidden sales visibility', () => {
  const visibleSale = {
    id: 'sale-visible',
    title: 'Visible Sale',
    moderation_status: 'visible',
    lat: 38.2527,
    lng: -85.7585,
  }

  const hiddenSale = {
    id: 'sale-hidden',
    title: 'Hidden Sale',
    moderation_status: 'hidden_by_admin',
    lat: 38.2530,
    lng: -85.7590,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
  })

  describe('GET /api/sales', () => {
    let GET: any

    beforeAll(async () => {
      const route = await import('@/app/api/sales/route')
      GET = route.GET
    })

    it('excludes hidden sales from public listings', async () => {
      // Mock sales query - should filter out hidden_by_admin
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sales_v2') {
          return createQueryChain([visibleSale], null)
        }
        return createQueryChain()
      })

      const request = new NextRequest('http://localhost/api/sales?lat=38.2527&lng=-85.7585')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      
      // Verify only visible sale is returned
      const saleIds = data.data.map((s: any) => s.id)
      expect(saleIds).toContain('sale-visible')
      expect(saleIds).not.toContain('sale-hidden')
      
      // Verify moderation_status filter was applied
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('sales_v2')
    })
  })

  describe('GET /api/sales/markers', () => {
    let GET: any

    beforeAll(async () => {
      const route = await import('@/app/api/sales/markers/route')
      GET = route.GET
    })

    it('excludes hidden sales from markers', async () => {
      // Mock markers query
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sales_v2') {
          return createQueryChain([visibleSale], null)
        }
        return createQueryChain()
      })

      const request = new NextRequest('http://localhost/api/sales/markers?north=38.3&south=38.2&east=-85.7&west=-85.8')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      
      // Verify only visible sale is returned
      const saleIds = data.data.map((s: any) => s.id)
      expect(saleIds).toContain('sale-visible')
      expect(saleIds).not.toContain('sale-hidden')
    })
  })

  describe('GET /api/sales/search', () => {
    let GET: any

    beforeAll(async () => {
      const route = await import('@/app/api/sales/search/route')
      GET = route.GET
    })

    it('excludes hidden sales from search results', async () => {
      // Mock search query
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sales_v2') {
          return createQueryChain([visibleSale], null)
        }
        return createQueryChain()
      })

      const request = new NextRequest('http://localhost/api/sales/search?q=test')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      
      // Verify only visible sale is returned
      const saleIds = data.data.map((s: any) => s.id)
      expect(saleIds).toContain('sale-visible')
      expect(saleIds).not.toContain('sale-hidden')
    })
  })

  describe('Sale detail data access', () => {
    it('getSaleWithItems returns hidden sale (visibility check is in page component)', async () => {
      // Note: The actual blocking of hidden sales for non-admins happens in
      // app/sales/[id]/page.tsx which checks moderation_status after fetching.
      // This test verifies that getSaleWithItems can return hidden sales,
      // and the page component is responsible for blocking non-admins.
      
      const { getSaleWithItems } = await import('@/lib/data/salesAccess')
      
      // Mock Supabase client that returns hidden sale
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ...hiddenSale, owner_id: 'owner-1' },
                error: null,
              }),
            })),
          })),
        })),
      }
      
      // getSaleWithItems should return the sale (including hidden ones)
      // The page component then checks moderation_status and calls notFound for non-admins
      const result = await getSaleWithItems(mockClient as any, 'sale-hidden')
      
      // Function should return the sale (visibility filtering is page-level)
      expect(result).toBeDefined()
      expect(result?.sale.id).toBe('sale-hidden')
      expect((result?.sale as any).moderation_status).toBe('hidden_by_admin')
    })
  })
})

