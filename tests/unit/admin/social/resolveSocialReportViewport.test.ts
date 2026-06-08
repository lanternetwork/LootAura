import { describe, it, expect } from 'vitest'
import { resolveSocialReportViewportForMetro } from '@/lib/admin/social/resolveSocialReportViewport'
import { TEST_SEO_METRO_CHICAGO, TEST_SEO_METRO_DALLAS } from '../../seo/seoTestFixtures'

describe('resolveSocialReportViewportForMetro', () => {
  it('uses canonical preset for Chicago', () => {
    const viewport = resolveSocialReportViewportForMetro(TEST_SEO_METRO_CHICAGO)
    expect(viewport.isRankingPreset).toBe(true)
    expect(viewport.centerLat).toBe(41.8781)
    expect(viewport.centerLng).toBe(-87.6298)
    expect(viewport.zoom).toBe(9)
    expect(viewport.timezone).toBe('America/Chicago')
    expect(viewport.bounds.north).toBeGreaterThan(viewport.bounds.south)
  })

  it('uses canonical preset for Dallas', () => {
    const viewport = resolveSocialReportViewportForMetro(TEST_SEO_METRO_DALLAS)
    expect(viewport.isRankingPreset).toBe(true)
    expect(viewport.zoom).toBe(9)
  })

  it('marks unknown metros as non-ranking fallbacks', () => {
    const viewport = resolveSocialReportViewportForMetro({
      slug: 'springfield-il',
      city: 'Springfield',
      state: 'IL',
      timezone: 'America/Chicago',
      minActiveListings: 25,
    })
    expect(viewport.isRankingPreset).toBe(false)
    expect(viewport.zoom).toBe(10)
  })
})
