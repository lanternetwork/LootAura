import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDiscoverSeoMetros = vi.hoisted(() => vi.fn())
const mockGetSeoMetrosForRequest = vi.hoisted(() => vi.fn())
const mockGetSaleWithItems = vi.hoisted(() => vi.fn())
const mockGetNearestSalesForSale = vi.hoisted(() => vi.fn())
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn())
const mockGetUserRatingForSeller = vi.hoisted(() => vi.fn())

const requestCacheStore = vi.hoisted(() => new Map<string, Promise<unknown>>())

vi.mock('@/lib/seo/metroCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo/metroCatalog')>('@/lib/seo/metroCatalog')
  return {
    ...actual,
    discoverSeoMetrosFromPublishedSales: (...args: unknown[]) => mockDiscoverSeoMetros(...args),
  }
})

vi.mock('@/lib/seo/loadSeoRolloutState', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo/loadSeoRolloutState')>('@/lib/seo/loadSeoRolloutState')
  return {
    ...actual,
    getSeoMetrosForRequest: (...args: unknown[]) => mockGetSeoMetrosForRequest(...args),
    getSeoRolloutStateForRequest: vi.fn().mockResolvedValue({
      publicIndexingEnabled: false,
      publicIndexingEnabledAt: null,
      publicIndexingDisabledAt: null,
      crawlValidationPassed: false,
      crawlValidationPassedAt: null,
      searchConsoleValidationPassed: false,
      searchConsoleValidationPassedAt: null,
    }),
  }
})

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
    getSaleWithItems: (...args: unknown[]) => mockGetSaleWithItems(...args),
    getNearestSalesForSale: (...args: unknown[]) => mockGetNearestSalesForSale(...args),
  }
})

vi.mock('@/lib/data/ratingsAccess', () => ({
  getUserRatingForSeller: (...args: unknown[]) => mockGetUserRatingForSeller(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) => mockCreateSupabaseServerClient(...args),
}))

vi.mock('@/app/sales/[id]/SaleDetailClient', () => ({
  default: () => null,
}))

vi.mock('@/components/seo/SaleDetailSsrContent', () => ({
  default: () => null,
}))

vi.mock('@/components/sales/SellerActivityCard', () => ({
  SellerActivityCard: () => null,
}))

vi.mock('@/app/sales/[id]/SaleDetailNearbySales', () => ({
  default: () => null,
}))

vi.mock('@/app/sales/[id]/SaleDetailSellerActivity', () => ({
  default: () => null,
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
      ...overrides,
    },
    items: [],
  }
}

describe('sale detail critical path trim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    requestCacheStore.clear()

    mockDiscoverSeoMetros.mockResolvedValue([])
    mockGetSeoMetrosForRequest.mockResolvedValue([])
    mockGetUserRatingForSeller.mockResolvedValue(null)
    mockGetNearestSalesForSale.mockResolvedValue([
      { id: 'nearby-1', title: 'Nearby 1', distance_m: 100 },
      { id: 'nearby-2', title: 'Nearby 2', distance_m: 200 },
      { id: 'nearby-3', title: 'Nearby 3', distance_m: 300 },
    ])
    mockGetSaleWithItems.mockResolvedValue(buildSaleResult())
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })
  })

  it('does not execute nationwide metro discovery during page render', async () => {
    const page = await import('@/app/sales/[id]/page')
    await page.default({ params: Promise.resolve({ id: 'sale-1' }) })

    expect(mockGetSeoMetrosForRequest).not.toHaveBeenCalled()
    expect(mockDiscoverSeoMetros).not.toHaveBeenCalled()
  })

  it('dedupes getSaleWithItems across metadata and page within one request', async () => {
    const page = await import('@/app/sales/[id]/page')
    await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    await page.default({ params: Promise.resolve({ id: 'sale-1' }) })

    expect(mockGetSaleWithItems).toHaveBeenCalledTimes(1)
    expect(mockGetSaleWithItems).toHaveBeenCalledWith(expect.anything(), 'sale-1')
  })

  it('does not fetch nearest sales during initial page render', async () => {
    const page = await import('@/app/sales/[id]/page')
    await page.default({ params: Promise.resolve({ id: 'sale-1' }) })

    expect(mockGetNearestSalesForSale).not.toHaveBeenCalled()
  })

  it('does not fetch user rating during initial page render', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'viewer-1', email: 'viewer@example.com' } },
        }),
      },
    })

    const page = await import('@/app/sales/[id]/page')
    await page.default({ params: Promise.resolve({ id: 'sale-1' }) })

    expect(mockGetUserRatingForSeller).not.toHaveBeenCalled()
  })
})
