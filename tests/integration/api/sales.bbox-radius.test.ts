/**
 * Integration tests: bbox browse vs near=1 distance semantics (PR #520).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/sales/route'
import { makeThenableQuery, type QueryResult } from '@/tests/helpers/mockSupabaseQuery'

const CENTER_LAT = 38.25
const CENTER_LNG = -85.75

/** ~0 km from bbox center */
const SALE_NEAR = {
  id: 'near',
  lat: CENTER_LAT,
  lng: CENTER_LNG,
  title: 'Near sale',
  date_start: '2026-06-01',
  time_start: '09:00:00',
  date_end: '2026-06-02',
  status: 'published',
}

/** ~8 km from center (~5 mi) */
const SALE_MID = {
  id: 'mid',
  lat: CENTER_LAT + 0.072,
  lng: CENTER_LNG,
  title: 'Mid sale',
  date_start: '2026-06-01',
  time_start: '09:00:00',
  date_end: '2026-06-02',
  status: 'published',
}

/** ~22 km from center (~14 mi) — inside bbox, outside 10 mi radius */
const SALE_FAR = {
  id: 'far',
  lat: CENTER_LAT + 0.2,
  lng: CENTER_LNG,
  title: 'Far sale',
  date_start: '2026-06-01',
  time_start: '09:00:00',
  date_end: '2026-06-02',
  status: 'published',
}

const ALL_SALES = [SALE_NEAR, SALE_MID, SALE_FAR]

const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: async () => mockSupabaseClient,
  fromBase: () => mockSupabaseClient,
}))

vi.mock('@/lib/log', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  generateOperationId: () => 'test-op-id',
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown) => handler,
}))

vi.mock('@/lib/shared/categoryNormalizer', () => ({
  normalizeCategories: vi.fn(() => []),
}))

vi.mock('@/lib/shared/categoryContract', () => ({
  toDbSet: vi.fn(() => []),
}))

vi.mock('@/lib/shared/dateBounds', () => ({
  validateDateRange: vi.fn(() => ({ valid: true })),
}))

vi.mock('@/lib/shared/bboxValidation', () => ({
  validateBboxSize: vi.fn(() => null),
  getBboxSummary: vi.fn(() => ({})),
}))

vi.mock('@/lib/cache/salesApiCache', () => ({
  buildSalesCacheKey: vi.fn(() => 'test-key'),
  getSalesApiCache: vi.fn().mockResolvedValue(null),
  setSalesApiCache: vi.fn().mockResolvedValue(undefined),
}))

function setupSalesMock(sales: typeof ALL_SALES) {
  const result: QueryResult = { data: sales, error: null, count: sales.length }

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'sales_v2') {
      const createCountQuery = () => {
        const countPromise = Promise.resolve({ count: sales.length, error: null })
        return new Proxy(
          {},
          {
            get(_target, prop) {
              const propName = String(prop)
              if (propName === 'then') return countPromise.then.bind(countPromise)
              if (propName === 'catch') return countPromise.catch.bind(countPromise)
              if (propName === 'finally') return countPromise.finally.bind(countPromise)
              return () => createCountQuery()
            },
          }
        )
      }

      const mainQuery = makeThenableQuery(result)
      return new Proxy(mainQuery, {
        get(target, prop) {
          if (prop === 'select') {
            return function (_columns?: string, options?: { count?: string; head?: boolean }) {
              if (options?.count || options?.head) {
                return createCountQuery()
              }
              return target
            }
          }
          return (target as Record<string, unknown>)[prop as string]
        },
      })
    }
    return makeThenableQuery({ data: [], error: null })
  })
}

function createBboxRequest(radiusKm: number) {
  const url = new URL('http://localhost:3000/api/sales')
  url.searchParams.set('north', String(CENTER_LAT + 0.25))
  url.searchParams.set('south', String(CENTER_LAT - 0.25))
  url.searchParams.set('east', String(CENTER_LNG + 0.25))
  url.searchParams.set('west', String(CENTER_LNG - 0.25))
  url.searchParams.set('radiusKm', String(radiusKm))
  url.searchParams.set('limit', '200')
  return new NextRequest(url)
}

function createNearRequest(radiusKm: number) {
  const url = new URL('http://localhost:3000/api/sales')
  url.searchParams.set('near', '1')
  url.searchParams.set('lat', String(CENTER_LAT))
  url.searchParams.set('lng', String(CENTER_LNG))
  url.searchParams.set('radiusKm', String(radiusKm))
  url.searchParams.set('limit', '200')
  return new NextRequest(url)
}

describe('GET /api/sales bbox browse (viewport inventory gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSalesMock(ALL_SALES)
  })

  it('includes sales inside fetch bbox even when beyond radiusKm (10 mi ≈ 16.09 km)', async () => {
    const response = await GET(createBboxRequest(16.0934))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    const ids = (body.data as { id: string }[]).map((s) => s.id)

    expect(ids).toContain('near')
    expect(ids).toContain('mid')
    expect(ids).toContain('far')
  })

  it('does not change bbox result count when radiusKm param differs', async () => {
    const small = await GET(createBboxRequest(16.0934))
    const large = await GET(createBboxRequest(80.4672))

    const smallBody = await small.json()
    const largeBody = await large.json()

    expect(smallBody.data).toHaveLength(3)
    expect(largeBody.data).toHaveLength(3)
  })

  it('still returns distanceKm metadata and distance_m for sort/labels', async () => {
    const response = await GET(createBboxRequest(16.0934))
    const body = await response.json()

    expect(body.distanceKm).toBeCloseTo(16.0934, 2)
    const rows = body.data as { id: string; distance_m: number }[]
    expect(rows.every((r) => typeof r.distance_m === 'number')).toBe(true)
    expect(rows.map((r) => r.id)).toEqual(['near', 'mid', 'far'])
  })
})

describe('GET /api/sales near=1 (radiusKm post-filter unchanged)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSalesMock(ALL_SALES)
  })

  it('excludes sales beyond radiusKm on near path (10 mi ≈ 16.09 km)', async () => {
    const response = await GET(createNearRequest(16.0934))
    expect(response.status).toBe(200)

    const body = await response.json()
    const ids = (body.data as { id: string }[]).map((s) => s.id)

    expect(ids).toContain('near')
    expect(ids).toContain('mid')
    expect(ids).not.toContain('far')
  })

  it('returns more sales for larger radiusKm when inventory exists (50 mi ≈ 80.47 km)', async () => {
    const small = await GET(createNearRequest(16.0934))
    const large = await GET(createNearRequest(80.4672))

    const smallBody = await small.json()
    const largeBody = await large.json()

    expect(smallBody.data.length).toBeLessThan(largeBody.data.length)
    expect(largeBody.data.map((s: { id: string }) => s.id)).toContain('far')
  })
})
