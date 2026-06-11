import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/seo/metroCatalog', () => ({
  discoverSeoMetrosFromPublishedSales: vi.fn(),
}))

vi.mock('@/lib/admin/social/weekendInventoryQuery', () => ({
  fetchWeekendSalesInViewport: vi.fn(),
  fetchPresetViewportWeekendCountsBySlug: vi.fn(),
}))

describe('buildSocialCityReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('builds a Chicago preset report when discovery is empty', async () => {
    const { discoverSeoMetrosFromPublishedSales } = await import('@/lib/seo/metroCatalog')
    const {
      fetchWeekendSalesInViewport,
      fetchPresetViewportWeekendCountsBySlug,
    } = await import('@/lib/admin/social/weekendInventoryQuery')
    const { buildSocialCityReport } = await import('@/lib/admin/social/buildSocialCityReport')

    vi.mocked(discoverSeoMetrosFromPublishedSales).mockResolvedValue([])
    vi.mocked(fetchWeekendSalesInViewport).mockResolvedValue({
      pins: [{ id: 'sale-1', lat: 41.88, lng: -87.63, is_featured: false }],
      activeSales: 39,
      estateSales: 10,
      yardSales: 29,
    })
    vi.mocked(fetchPresetViewportWeekendCountsBySlug).mockResolvedValue({
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
    const { discoverSeoMetrosFromPublishedSales } = await import('@/lib/seo/metroCatalog')
    const { buildSocialCityReport, SocialCityReportError } = await import(
      '@/lib/admin/social/buildSocialCityReport'
    )

    vi.mocked(discoverSeoMetrosFromPublishedSales).mockResolvedValue([])

    await expect(buildSocialCityReport('unknown-il', 'instagram-feed')).rejects.toMatchObject({
      code: 'METRO_NOT_FOUND',
      status: 404,
    })
    await expect(buildSocialCityReport('unknown-il', 'instagram-feed')).rejects.toBeInstanceOf(
      SocialCityReportError
    )
  })
})
