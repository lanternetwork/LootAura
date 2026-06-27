import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_GEO_CHICAGO } from '../../seo/metroGeographyTestFixtures'

const mockDiscoverMetros = vi.hoisted(() => vi.fn())
const mockLoadGeographyBySlugs = vi.hoisted(() => vi.fn())

vi.mock('@/lib/seo/metroCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo/metroCatalog')>()
  return {
    ...actual,
    discoverSeoMetrosFromPublishedSales: (...args: unknown[]) => mockDiscoverMetros(...args),
  }
})

vi.mock('@/lib/seo/snapshots/loadSeoMetroGeography', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo/snapshots/loadSeoMetroGeography')>()
  return {
    ...actual,
    loadSeoMetroGeographyBySlugs: (...args: unknown[]) => mockLoadGeographyBySlugs(...args),
  }
})

vi.mock('@/lib/admin/social/socialMetroInventory', () => ({
  loadSocialWeekendInventoryFromSnapshot: vi.fn(),
  fetchPresetWeekendCountsBySlugFromSnapshot: vi.fn(),
}))

describe('buildSocialCityReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockDiscoverMetros.mockResolvedValue([])
    mockLoadGeographyBySlugs.mockResolvedValue([TEST_GEO_CHICAGO])
  })

  it('builds a Chicago preset report when discovery is empty', async () => {
    const {
      loadSocialWeekendInventoryFromSnapshot,
      fetchPresetWeekendCountsBySlugFromSnapshot,
    } = await import('@/lib/admin/social/socialMetroInventory')
    const { buildSocialCityReport } = await import('@/lib/admin/social/buildSocialCityReport')
    vi.mocked(loadSocialWeekendInventoryFromSnapshot).mockResolvedValue({
      pins: [{ id: 'sale-1', lat: 41.88, lng: -87.63, title: 'Estate Sale', is_featured: false }],
      activeSales: 39,
      estateSales: 10,
      yardSales: 29,
    })
    vi.mocked(fetchPresetWeekendCountsBySlugFromSnapshot).mockResolvedValue({
      'chicago-il': 39,
      'dallas-tx': 20,
      'houston-tx': 15,
      'phoenix-az': 12,
      'atlanta-ga': 11,
      'austin-tx': 8,
      'louisville-ky': 5,
    })

    const report = await buildSocialCityReport('chicago-il', 'instagram-feed')

    expect(report.citySlug).toBe('chicago-il')
    expect(report.city).toBe('Chicago')
    expect(report.state).toBe('IL')
    expect(report.activeSales).toBe(39)
    expect(report.cityRank).toBe(1)
    expect(report.mapViewport.centerLat).toBe(41.8781)
  })

  it('returns METRO_NOT_FOUND for unknown non-preset slugs', async () => {
    mockLoadGeographyBySlugs.mockResolvedValue([])
    const { buildSocialCityReport, SocialCityReportError } = await import(
      '@/lib/admin/social/buildSocialCityReport'
    )

    await expect(buildSocialCityReport('unknown-il', 'instagram-feed')).rejects.toMatchObject({
      code: 'METRO_NOT_FOUND',
      status: 404,
    })
    await expect(buildSocialCityReport('unknown-il', 'instagram-feed')).rejects.toBeInstanceOf(
      SocialCityReportError
    )
  })
})
