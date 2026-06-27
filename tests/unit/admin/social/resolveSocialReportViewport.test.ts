import { describe, it, expect } from 'vitest'
import { resolveSocialReportViewportForMetro } from '@/lib/admin/social/resolveSocialReportViewport'
import { TEST_GEO_CHICAGO } from '../../seo/metroGeographyTestFixtures'
import { TEST_SEO_METRO_CHICAGO, TEST_SEO_METRO_DALLAS } from '../../seo/seoTestFixtures'

describe('resolveSocialReportViewportForMetro', () => {
  it('uses geography center and preset zoom for Chicago', () => {
    const viewport = resolveSocialReportViewportForMetro(
      TEST_SEO_METRO_CHICAGO,
      'instagram-feed',
      TEST_GEO_CHICAGO
    )
    expect(viewport.isRankingPreset).toBe(true)
    expect(viewport.centerLat).toBe(41.8781)
    expect(viewport.centerLng).toBe(-87.6298)
    expect(viewport.zoom).toBe(8)
    expect(viewport.timezone).toBe('America/Chicago')
    expect(viewport.bounds.north).toBeGreaterThan(viewport.bounds.south)
  })

  it('uses canonical preset zoom for Dallas', () => {
    const viewport = resolveSocialReportViewportForMetro(
      TEST_SEO_METRO_DALLAS,
      'instagram-feed',
      {
        ...TEST_GEO_CHICAGO,
        slug: 'dallas-tx',
        center_lat: 32.7767,
        center_lng: -96.797,
      }
    )
    expect(viewport.isRankingPreset).toBe(true)
    expect(viewport.zoom).toBe(8)
  })

  it('marks unknown metros as non-ranking fallbacks', () => {
    const viewport = resolveSocialReportViewportForMetro(
      {
        slug: 'springfield-il',
        city: 'Springfield',
        state: 'IL',
        timezone: 'America/Chicago',
        minActiveListings: 25,
      },
      'instagram-feed',
      null
    )
    expect(viewport.isRankingPreset).toBe(false)
    expect(viewport.zoom).toBe(10)
  })

  it('produces wider bounds for vertical-story than instagram-feed at same center/zoom', () => {
    const instagram = resolveSocialReportViewportForMetro(
      TEST_SEO_METRO_CHICAGO,
      'instagram-feed',
      TEST_GEO_CHICAGO
    )
    const vertical = resolveSocialReportViewportForMetro(
      TEST_SEO_METRO_CHICAGO,
      'vertical-story',
      TEST_GEO_CHICAGO
    )

    expect(vertical.bounds.north - vertical.bounds.south).toBeGreaterThan(
      instagram.bounds.north - instagram.bounds.south
    )
  })
})
