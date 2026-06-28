import { describe, it, expect } from 'vitest'
import { TEST_GEO_DALLAS } from './metroGeographyTestFixtures'
import {
  resolveMetroMapViewport,
  salesToMetroMapPins,
} from '@/lib/seo/metroMapViewport'

describe('resolveMetroMapViewport', () => {
  it('returns geography center with preset zoom for ranked metros', () => {
    expect(resolveMetroMapViewport('dallas-tx', TEST_GEO_DALLAS)).toEqual({
      centerLat: TEST_GEO_DALLAS.center_lat,
      centerLng: TEST_GEO_DALLAS.center_lng,
      zoom: 8,
    })
  })

  it('returns null when geography is missing', () => {
    expect(resolveMetroMapViewport('dallas-tx', null)).toBeNull()
  })
})

describe('salesToMetroMapPins', () => {
  it('maps sales with coordinates and skips rows without lat/lng', () => {
    expect(
      salesToMetroMapPins([
        { id: 'a', lat: 1, lng: 2 },
        { id: 'b', lat: null, lng: 3 },
        { id: 'c', lat: 4, lng: null },
      ])
    ).toEqual([{ id: 'a', lat: 1, lng: 2, is_featured: false }])
  })
})
