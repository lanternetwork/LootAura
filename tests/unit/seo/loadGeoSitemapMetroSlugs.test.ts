import { describe, it, expect, vi, beforeEach } from 'vitest'

const loadQualifiedMetroSlugsMock = vi.fn()
const loadGeographyQualifiedOverrideSlugsMock = vi.fn()

vi.mock('@/lib/seo/snapshots/loadSeoQualifiedMetros', () => ({
  loadQualifiedMetroSlugs: (...args: unknown[]) => loadQualifiedMetroSlugsMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoMetroGeography', () => ({
  loadGeographyQualifiedOverrideSlugs: (...args: unknown[]) =>
    loadGeographyQualifiedOverrideSlugsMock(...args),
}))

describe('loadGeoSitemapMetroSlugs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadQualifiedMetroSlugsMock.mockResolvedValue(['dallas-tx'])
    loadGeographyQualifiedOverrideSlugsMock.mockResolvedValue(['louisville-ky', 'chicago-il'])
  })

  it('returns empty when national emission is off', async () => {
    const { loadGeoSitemapMetroSlugs } = await import('@/lib/seo/snapshots/loadGeoSitemapMetroSlugs')
    const slugs = await loadGeoSitemapMetroSlugs(false)
    expect(slugs).toEqual([])
  })

  it('unions qualified and geography override slugs when emission is on', async () => {
    const { loadGeoSitemapMetroSlugs } = await import('@/lib/seo/snapshots/loadGeoSitemapMetroSlugs')
    const slugs = await loadGeoSitemapMetroSlugs(true)
    expect(slugs.sort()).toEqual(['chicago-il', 'dallas-tx', 'louisville-ky'])
  })
})
