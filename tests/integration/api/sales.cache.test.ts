/**
 * Integration tests for GET /api/sales short-TTL cache behavior.
 * Ensures: (a) user-scoped requests (favoritesOnly) are never cached.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/sales/route'

const mockSetSalesApiCache = vi.fn()
const mockGetSalesApiCache = vi.fn()
const mockBuildSalesCacheKey = vi.fn()

vi.mock('@/lib/cache/salesApiCache', () => ({
  buildSalesCacheKey: (...args: unknown[]) => mockBuildSalesCacheKey(...args),
  getSalesApiCache: (...args: unknown[]) => mockGetSalesApiCache(...args),
  setSalesApiCache: (...args: unknown[]) => mockSetSalesApiCache(...args),
}))

const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: async () => ({ from: vi.fn() }),
  fromBase: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  generateOperationId: () => 'test-op-id',
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: any) => handler,
}))

vi.mock('@/lib/shared/categoryNormalizer', () => ({
  normalizeCategories: vi.fn((input: string) => (input ? input.split(',').filter(Boolean) : [])),
}))

vi.mock('@/lib/shared/categoryContract', () => ({
  toDbSet: vi.fn((x: string[]) => x),
}))

vi.mock('@/lib/shared/dateBounds', () => ({
  validateDateRange: vi.fn(() => ({ valid: true })),
}))

vi.mock('@/lib/shared/bboxValidation', () => ({
  validateBboxSize: vi.fn(() => null),
  getBboxSummary: vi.fn(() => ({})),
}))

vi.mock('@/lib/sanitize', () => ({
  sanitizePostgrestIlikeQuery: vi.fn((q: string) => q),
}))

describe('GET /api/sales cache behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSalesApiCache.mockResolvedValue(null)
    mockBuildSalesCacheKey.mockReturnValue('test-cache-key')
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
  })

  it('user-scoped requests (favoritesOnly) are never cached', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    const fromChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    }
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'favorites_v2') {
        return {
          ...fromChain,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [{ sale_id: 's1' }], error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    const url = 'http://localhost/api/sales?north=38.1&south=38.0&east=-85.0&west=-85.1&favoritesOnly=1'
    const request = new NextRequest(url, { method: 'GET' })
    await GET(request)

    expect(mockSetSalesApiCache).not.toHaveBeenCalled()
  })

  it('public requests use cache (get then set on miss)', async () => {
    let fromCallCount = 0
    mockSupabaseClient.from.mockImplementation((table: string) => {
      fromCallCount++
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      if (table === 'sales_v2' && fromCallCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }
      }
      return chain
    })

    const url = 'http://localhost/api/sales?north=38.1&south=38.0&east=-85.0&west=-85.1'
    const request = new NextRequest(url, { method: 'GET' })
    await GET(request)

    expect(mockGetSalesApiCache).toHaveBeenCalled()
    expect(mockSetSalesApiCache).toHaveBeenCalledTimes(1)
  })
})
