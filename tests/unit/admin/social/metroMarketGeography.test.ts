import { describe, it, expect } from 'vitest'
import {
  buildBoundsFromCoords,
  buildMarketBoundsAroundGeography,
  resolveMetroSlugForSale,
} from '@/lib/admin/social/metroMarketGeography'
import {
  TEST_GEO_CHICAGO,
  TEST_GEO_DALLAS,
  TEST_SOCIAL_PRESET_GEOGRAPHY,
} from '../../seo/metroGeographyTestFixtures'

describe('metroMarketGeography', () => {
  it('assigns suburb coordinates to Chicago market area', () => {
    const slug = resolveMetroSlugForSale(
      { city: 'Evanston', state: 'IL', lat: 42.0451, lng: -87.6877 },
      TEST_SOCIAL_PRESET_GEOGRAPHY
    )
    expect(slug).toBe('chicago-il')
  })

  it('falls back to city/state slug when coords are outside market radius', () => {
    const slug = resolveMetroSlugForSale(
      { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
      [TEST_GEO_DALLAS]
    )
    expect(slug).toBe('dallas-tx')
  })

  it('falls back to literal city slug without coordinates', () => {
    const slug = resolveMetroSlugForSale(
      { city: 'Chicago', state: 'IL', lat: null, lng: null },
      [TEST_GEO_CHICAGO]
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

  it('builds metro-scale market bounds around geography radius', () => {
    const bounds = buildMarketBoundsAroundGeography(TEST_GEO_CHICAGO)
    expect(bounds.north).toBeGreaterThan(TEST_GEO_CHICAGO.center_lat)
    expect(bounds.south).toBeLessThan(TEST_GEO_CHICAGO.center_lat)
    expect(bounds.east).toBeGreaterThan(TEST_GEO_CHICAGO.center_lng)
    expect(bounds.west).toBeLessThan(TEST_GEO_CHICAGO.center_lng)
    expect(bounds.north - bounds.south).toBeGreaterThan(0.2)
  })
})
