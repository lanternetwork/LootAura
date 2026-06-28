import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'
import { TEST_GEO_DALLAS, TEST_GEO_LOUISVILLE } from '../../unit/seo/metroGeographyTestFixtures'

const resolveSitemapSeoGateMock = vi.fn()
const loadSeoQualifiedMetroBySlugMock = vi.fn()
const loadMetroInventoryFromSnapshotMock = vi.fn()
const loadNearbyQualifiedMetrosMock = vi.fn()
const loadSeoMetroHistoryBySlugMock = vi.fn()
const countMetroInventoryBySlugMock = vi.fn()
const loadSeoMetroGeographyBySlugMock = vi.fn()

vi.mock('@/lib/seo/resolveSitemapSeoGate', () => ({
  resolveSitemapSeoGate: (...args: unknown[]) => resolveSitemapSeoGateMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoQualifiedMetros', () => ({
  loadSeoQualifiedMetroBySlug: (...args: unknown[]) => loadSeoQualifiedMetroBySlugMock(...args),
  loadNearbyQualifiedMetros: (...args: unknown[]) => loadNearbyQualifiedMetrosMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoMetroInventory', () => ({
  loadMetroInventoryFromSnapshot: (...args: unknown[]) => loadMetroInventoryFromSnapshotMock(...args),
  countMetroInventoryBySlug: (...args: unknown[]) => countMetroInventoryBySlugMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoMetroHistory', () => ({
  loadSeoMetroHistoryBySlug: (...args: unknown[]) => loadSeoMetroHistoryBySlugMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoMetroGeography', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo/snapshots/loadSeoMetroGeography')>()
  return {
    ...actual,
    loadSeoMetroGeographyBySlug: (...args: unknown[]) => loadSeoMetroGeographyBySlugMock(...args),
  }
})

describe('loadMetroPageContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSitemapSeoGateMock.mockResolvedValue({
      seoEmissionAllowed: true,
      indexingAllowed: true,
      snapshotFresh: true,
      qualifiedMetroCount: 1,
    })
    loadSeoQualifiedMetroBySlugMock.mockResolvedValue({
      slug: 'dallas-tx',
      qualified: true,
      listing_count: 50,
      crawlable_ratio: 0.95,
      city: 'Dallas',
      state: 'TX',
      timezone: 'America/Chicago',
      updated_at: '2026-06-01T00:00:00.000Z',
    })
    loadSeoMetroGeographyBySlugMock.mockImplementation(async (slug: string) => {
      if (slug === 'dallas-tx') return TEST_GEO_DALLAS
      if (slug === 'louisville-ky') return TEST_GEO_LOUISVILLE
      if (slug === 'bardstown-ky') return null
      return null
    })
    loadMetroInventoryFromSnapshotMock.mockResolvedValue({
      sales: [{ id: 'sale-1', title: 'Garage Sale' }],
      summary: {
        activeListingCount: 1,
        lastUpdatedAt: '2026-06-01T00:00:00.000Z',
        crawlableInventoryPct: 1,
      },
    })
    loadNearbyQualifiedMetrosMock.mockResolvedValue([])
    loadSeoMetroHistoryBySlugMock.mockResolvedValue(null)
    countMetroInventoryBySlugMock.mockResolvedValue(1)
  })

  it('returns null when metro does not exist', async () => {
    loadSeoQualifiedMetroBySlugMock.mockResolvedValue(null)
    countMetroInventoryBySlugMock.mockResolvedValue(0)
    loadSeoMetroHistoryBySlugMock.mockResolvedValue(null)
    loadSeoMetroGeographyBySlugMock.mockResolvedValue(null)
    const { loadMetroPageContext } = await import('@/lib/seo/snapshots/loadMetroPageContext')
    const context = await loadMetroPageContext('unknown-zz')
    expect(context).toBeNull()
  })

  it('returns qualified override context without qualified metros row', async () => {
    loadSeoQualifiedMetroBySlugMock.mockResolvedValue(null)
    countMetroInventoryBySlugMock.mockResolvedValue(0)
    loadMetroInventoryFromSnapshotMock.mockResolvedValue({
      sales: [],
      summary: { activeListingCount: 0, lastUpdatedAt: null, crawlableInventoryPct: 0 },
    })

    const { loadMetroPageContext } = await import('@/lib/seo/snapshots/loadMetroPageContext')
    const context = await loadMetroPageContext('louisville-ky')

    expect(context?.exists).toBe(true)
    expect(context?.qualifiedOverride).toBe(true)
    expect(context?.city).toBe('Louisville')
    expect(context?.robots).toBe('index,follow')
  })

  it('loads gate, metro row, and inventory once per slug', async () => {
    const { loadMetroPageContext } = await import('@/lib/seo/snapshots/loadMetroPageContext')
    const context = await loadMetroPageContext('dallas-tx')

    expect(context?.metro).toEqual(TEST_SEO_METRO_DALLAS)
    expect(context?.qualified).toBe(true)
    expect(context?.radiusMiles).toBe(TEST_GEO_DALLAS.radius_miles)
    expect(context?.mapViewport).toEqual({
      centerLat: TEST_GEO_DALLAS.center_lat,
      centerLng: TEST_GEO_DALLAS.center_lng,
      zoom: 8,
    })
    expect(context?.gate.seoEmissionAllowed).toBe(true)
    expect(loadMetroInventoryFromSnapshotMock).toHaveBeenCalledWith('dallas-tx', expect.anything())
    expect(resolveSitemapSeoGateMock).toHaveBeenCalledTimes(1)
  })

  it('noindex for non-override metro that is not qualified', async () => {
    loadSeoQualifiedMetroBySlugMock.mockResolvedValue({
      slug: 'bardstown-ky',
      qualified: false,
      listing_count: 5,
      crawlable_ratio: 0.8,
      city: 'Bardstown',
      state: 'KY',
      timezone: 'America/New_York',
      updated_at: '2026-06-01T00:00:00.000Z',
    })
    countMetroInventoryBySlugMock.mockResolvedValue(5)
    loadSeoMetroGeographyBySlugMock.mockResolvedValue(null)
    loadSeoMetroHistoryBySlugMock.mockResolvedValue({
      slug: 'bardstown-ky',
      city: 'Bardstown',
      state: 'KY',
      timezone: 'America/New_York',
      inventory_count_90d: 5,
      last_seen_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    })

    const { loadMetroPageContext } = await import('@/lib/seo/snapshots/loadMetroPageContext')
    const context = await loadMetroPageContext('bardstown-ky')

    expect(context?.exists).toBe(true)
    expect(context?.qualifiedOverride).toBe(false)
    expect(context?.robots).toBe('noindex,follow')
  })
})
