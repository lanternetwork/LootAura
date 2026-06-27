import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSeededMajorMetroSlugs } from '@/lib/seo/seededMajorMetros'

const loadQualifiedMetroSlugsMock = vi.fn()

vi.mock('@/lib/seo/snapshots/loadSeoQualifiedMetros', () => ({
  loadQualifiedMetroSlugs: (...args: unknown[]) => loadQualifiedMetroSlugsMock(...args),
}))

describe('loadGeoSitemapMetroSlugs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadQualifiedMetroSlugsMock.mockResolvedValue(['dallas-tx'])
  })

  it('returns empty when national emission is off', async () => {
    const { loadGeoSitemapMetroSlugs } = await import('@/lib/seo/snapshots/loadGeoSitemapMetroSlugs')
    const slugs = await loadGeoSitemapMetroSlugs(false)
    expect(slugs).toEqual([])
  })

  it('unions qualified and seeded slugs when emission is on', async () => {
    const { loadGeoSitemapMetroSlugs } = await import('@/lib/seo/snapshots/loadGeoSitemapMetroSlugs')
    const slugs = await loadGeoSitemapMetroSlugs(true)
    const expected = [...new Set(['dallas-tx', ...getSeededMajorMetroSlugs()])].sort()
    expect(slugs.sort()).toEqual(expected)
  })
})
