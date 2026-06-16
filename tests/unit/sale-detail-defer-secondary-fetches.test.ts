import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetNearestSalesForSale = vi.hoisted(() => vi.fn())
const mockGetUserRatingForSeller = vi.hoisted(() => vi.fn())
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn())

const requestCacheStore = vi.hoisted(() => new Map<string, Promise<unknown>>())

vi.mock('@/lib/seo/requestCache', () => ({
  requestCache: <T extends (...args: never[]) => unknown>(fn: T): T => {
    const wrapped = (async (...args: never[]) => {
      const key = JSON.stringify(args)
      if (!requestCacheStore.has(key)) {
        requestCacheStore.set(key, Promise.resolve(fn(...args)))
      }
      return requestCacheStore.get(key)
    }) as T
    return wrapped
  },
}))

vi.mock('@/lib/data/salesAccess', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data/salesAccess')>('@/lib/data/salesAccess')
  return {
    ...actual,
    getNearestSalesForSale: (...args: unknown[]) => mockGetNearestSalesForSale(...args),
  }
})

vi.mock('@/lib/data/ratingsAccess', () => ({
  getUserRatingForSeller: (...args: unknown[]) => mockGetUserRatingForSeller(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) => mockCreateSupabaseServerClient(...args),
}))

vi.mock('@/components/sales/NearbySalesCard', () => ({
  NearbySalesCard: () => null,
}))

vi.mock('@/components/sales/SellerActivityCard', () => ({
  SellerActivityCard: () => null,
}))

function buildSaleResult(overrides: Record<string, unknown> = {}) {
  return {
    sale: {
      id: 'sale-1',
      owner_id: 'owner-1',
      title: 'Test Sale',
      city: 'Louisville',
      state: 'KY',
      lat: 38.25,
      lng: -85.75,
      date_start: '2026-06-01',
      time_start: '09:00',
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      moderation_status: 'approved',
      archived_at: null,
      owner_profile: { id: 'owner-1', full_name: 'Seller' },
      owner_stats: { avg_rating: 4.5, ratings_count: 2, total_sales: 3 },
      ...overrides,
    },
    items: [],
  }
}

describe('sale detail defer secondary fetches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    requestCacheStore.clear()

    mockGetUserRatingForSeller.mockResolvedValue(4)
    mockGetNearestSalesForSale.mockResolvedValue([
      { id: 'nearby-1', title: 'Nearby 1', distance_m: 100 },
      { id: 'nearby-2', title: 'Nearby 2', distance_m: 200 },
      { id: 'nearby-3', title: 'Nearby 3', distance_m: 300 },
    ])
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })
  })

  it('loads nearest sales in deferred boundary with limit 6 and known coordinates', async () => {
    const nearby = await import('@/app/sales/[id]/SaleDetailNearbySales')
    const result = await nearby.default({
      saleId: 'sale-1',
      coords: { lat: 38.25, lng: -85.75 },
      className: 'w-full',
    })

    expect(result).not.toBeNull()
    expect(mockGetNearestSalesForSale).toHaveBeenCalledTimes(1)
    expect(mockGetNearestSalesForSale).toHaveBeenCalledWith(
      expect.anything(),
      'sale-1',
      6,
      { lat: 38.25, lng: -85.75 }
    )
  })

  it('dedupes nearest-sales fetch across mobile and desktop deferred boundaries', async () => {
    const nearby = await import('@/app/sales/[id]/SaleDetailNearbySales')
    await nearby.default({
      saleId: 'sale-1',
      coords: { lat: 38.25, lng: -85.75 },
      className: 'w-full',
    })
    await nearby.default({
      saleId: 'sale-1',
      coords: { lat: 38.25, lng: -85.75 },
    })

    expect(mockGetNearestSalesForSale).toHaveBeenCalledTimes(1)
  })

  it('loads user rating in deferred seller activity boundary', async () => {
    const sellerActivity = await import('@/app/sales/[id]/SaleDetailSellerActivity')
    const saleResult = buildSaleResult()
    await sellerActivity.default({
      sale: saleResult.sale as any,
      viewerUserId: 'viewer-1',
    })

    expect(mockGetUserRatingForSeller).toHaveBeenCalledWith(
      expect.anything(),
      'owner-1',
      'viewer-1'
    )
  })

  it('skips user rating fetch for seller viewing own sale', async () => {
    const sellerActivity = await import('@/app/sales/[id]/SaleDetailSellerActivity')
    const saleResult = buildSaleResult()
    await sellerActivity.default({
      sale: saleResult.sale as any,
      viewerUserId: 'owner-1',
    })

    expect(mockGetUserRatingForSeller).not.toHaveBeenCalled()
  })
})
