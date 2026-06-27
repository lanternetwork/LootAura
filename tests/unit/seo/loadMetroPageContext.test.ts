import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_SEO_METRO_DALLAS } from '../../unit/seo/seoTestFixtures'

const resolveSitemapSeoGateMock = vi.fn()
const loadSeoQualifiedMetroBySlugMock = vi.fn()
const loadMetroInventoryFromSnapshotMock = vi.fn()
const loadNearbyQualifiedMetrosMock = vi.fn()

vi.mock('@/lib/seo/resolveSitemapSeoGate', () => ({
  resolveSitemapSeoGate: (...args: unknown[]) => resolveSitemapSeoGateMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoQualifiedMetros', () => ({
  loadSeoQualifiedMetroBySlug: (...args: unknown[]) => loadSeoQualifiedMetroBySlugMock(...args),
  loadNearbyQualifiedMetros: (...args: unknown[]) => loadNearbyQualifiedMetrosMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoMetroInventory', () => ({
  loadMetroInventoryFromSnapshot: (...args: unknown[]) => loadMetroInventoryFromSnapshotMock(...args),
}))

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
    loadMetroInventoryFromSnapshotMock.mockResolvedValue({
      sales: [{ id: 'sale-1', title: 'Garage Sale' }],
      summary: {
        activeListingCount: 1,
        lastUpdatedAt: '2026-06-01T00:00:00.000Z',
        crawlableInventoryPct: 1,
      },
    })
    loadNearbyQualifiedMetrosMock.mockResolvedValue([])
  })

  it('returns null when metro slug is absent from qualified metros snapshot', async () => {
    loadSeoQualifiedMetroBySlugMock.mockResolvedValue(null)
    const { loadMetroPageContext } = await import('@/lib/seo/snapshots/loadMetroPageContext')
    const context = await loadMetroPageContext('unknown-zz')
    expect(context).toBeNull()
  })

  it('loads gate, metro row, and inventory once per slug', async () => {
    const { loadMetroPageContext } = await import('@/lib/seo/snapshots/loadMetroPageContext')
    const context = await loadMetroPageContext('dallas-tx')

    expect(context?.metro).toEqual(TEST_SEO_METRO_DALLAS)
    expect(context?.metroQualified).toBe(true)
    expect(context?.gate.seoEmissionAllowed).toBe(true)
    expect(loadMetroInventoryFromSnapshotMock).toHaveBeenCalledWith('dallas-tx', expect.anything())
    expect(resolveSitemapSeoGateMock).toHaveBeenCalledTimes(1)
  })
})
