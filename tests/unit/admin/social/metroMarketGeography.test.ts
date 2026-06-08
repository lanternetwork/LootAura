import { describe, it, expect } from 'vitest'
import {
  METRO_MARKET_RADIUS_METERS,
  buildBoundsFromCoords,
  resolveMetroSlugForSale,
} from '@/lib/admin/social/metroMarketGeography'
import {
  TEST_SEO_METRO_CHICAGO,
  TEST_SEO_METRO_DALLAS,
} from '../../seo/seoTestFixtures'

describe('metroMarketGeography', () => {
  const metros = [TEST_SEO_METRO_CHICAGO, TEST_SEO_METRO_DALLAS]
  const anchors = {
    'chicago-il': { lat: 41.8781, lng: -87.6298 },
    'dallas-tx': { lat: 32.7767, lng: -96.797 },
  }

  it('assigns suburb coordinates to Chicago market area', () => {
    const slug = resolveMetroSlugForSale(
      { city: 'Evanston', state: 'IL', lat: 42.0451, lng: -87.6877 },
      metros,
      anchors
    )
    expect(slug).toBe('chicago-il')
  })

  it('falls back to city/state slug when coords are outside market radius', () => {
    const slug = resolveMetroSlugForSale(
      { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
      metros,
      anchors
    )
    expect(slug).toBe('dallas-tx')
  })

  it('falls back to literal city slug without coordinates', () => {
    const slug = resolveMetroSlugForSale(
      { city: 'Chicago', state: 'IL', lat: null, lng: null },
      metros,
      anchors
    )
    expect(slug).toBe('chicago-il')
  })

  it('builds bounds from coordinate list', () => {
    const bounds = buildBoundsFromCoords([
      { lat: 41.5, lng: -88.0 },
      { lat: 42.0, lng: -87.5 },
    ])
    expect(bounds).toEqual({
      west: -88,
      south: 41.5,
      east: -87.5,
      north: 42,
    })
  })

  it('uses a market radius large enough for Chicago suburbs', () => {
    expect(METRO_MARKET_RADIUS_METERS).toBeGreaterThanOrEqual(50_000)
  })
})
