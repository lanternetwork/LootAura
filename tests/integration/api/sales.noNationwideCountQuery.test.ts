/**
 * Ensures GET /api/sales does not issue an exact nationwide COUNT on sales_v2 by default.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/sales/route'

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
  normalizeCategories: vi.fn((input: string | undefined) =>
    input ? input.split(',').filter(Boolean) : []
  ),
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

vi.mock('@/lib/cache/salesApiCache', () => ({
  buildSalesCacheKey: vi.fn(() => 'noop'),
  getSalesApiCache: vi.fn(async () => null),
  setSalesApiCache: vi.fn(async () => {}),
}))

vi.mock('@/lib/sanitize', () => ({
  sanitizePostgrestIlikeQuery: vi.fn((q: string) => q),
}))

describe('GET /api/sales — no nationwide exact count hot path', () => {
  const selectSpy = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    selectSpy.mockReset()

    function buildChain(): any {
      const chain: any = {}
      const next = vi.fn(() => chain)
      chain.gte = next
      chain.lte = next
      chain.eq = next
      chain.is = next
      chain.or = next
      chain.in = next
      chain.order = next
      chain.neq = next
      chain.range = vi.fn().mockResolvedValue({ data: [], error: null, count: null })
      return chain
    }

    mockSupabaseClient.from.mockImplementation(() => ({
      select: (columns?: string | string[], options?: { count?: string; head?: boolean }) => {
        selectSpy(columns, options)
        if (options?.count === 'exact' && options?.head === true) {
          return Promise.reject(new Error('nationwide exact count should not be invoked'))
        }
        return buildChain()
      },
    }))
  })

  it('default bbox request never calls select(count: exact, head: true)', async () => {
    const url =
      'http://localhost/api/sales?north=40.9&south=40.8&east=-73.9&west=-74.2&distanceKm=40&limit=10&offset=0'
    const res = await GET(new NextRequest(url))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.pagination?.filteredApproxInFetchWindow).toBeDefined()
    expect(body.totalCount).toBe(null)
    for (const call of selectSpy.mock.calls as [unknown, { count?: string; head?: boolean } | undefined][]) {
      const opts = call[1]
      if (opts?.count === 'exact' && opts?.head === true) {
        throw new Error('unexpected nationwide count query')
      }
    }
  })
})
