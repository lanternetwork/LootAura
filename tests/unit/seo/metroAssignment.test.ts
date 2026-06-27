import { describe, it, expect } from 'vitest'
import { assignMetroSlug, belongsToMetro } from '@/lib/seo/metroAssignment'
import {
  TEST_GEO_CHICAGO,
  TEST_GEO_DALLAS,
  TEST_GEO_LOUISVILLE,
} from './metroGeographyTestFixtures'

describe('assignMetroSlug', () => {
  const metros = [TEST_GEO_CHICAGO, TEST_GEO_DALLAS, TEST_GEO_LOUISVILLE]

  it('assigns Jeffersontown coordinates to Louisville within 10 mi radius', () => {
    const slug = assignMetroSlug(
      { city: 'Jeffersontown', state: 'KY', lat: 38.22, lng: -85.72 },
      metros
    )
    expect(slug).toBe('louisville-ky')
  })

  it('excludes Bardstown at ~35 miles from Louisville center', () => {
    const slug = assignMetroSlug(
      { city: 'Bardstown', state: 'KY', lat: 37.8092, lng: -85.4669 },
      metros
    )
    expect(slug).not.toBe('louisville-ky')
  })

  it('picks nearest metro within radius when multiple candidates exist', () => {
    const slug = assignMetroSlug(
      { city: 'Evanston', state: 'IL', lat: 42.0451, lng: -87.6877 },
      metros
    )
    expect(slug).toBe('chicago-il')
  })

  it('tie-breaks equal-distance candidates by slug ascending', () => {
    const equidistantMetros = [
      { ...TEST_GEO_DALLAS, slug: 'zulu-tx', center_lat: 32.7767, center_lng: -96.797 },
      { ...TEST_GEO_DALLAS, slug: 'alpha-tx', center_lat: 32.7767, center_lng: -96.797 },
    ]
    const slug = assignMetroSlug({ lat: 32.7767, lng: -96.797 }, equidistantMetros)
    expect(slug).toBe('alpha-tx')
  })

  it('falls back to city/state slug when coordinates are missing', () => {
    const slug = assignMetroSlug({ city: 'Chicago', state: 'IL', lat: null, lng: null }, metros)
    expect(slug).toBe('chicago-il')
  })

  it('returns null when city/state slug is not in geography', () => {
    const slug = assignMetroSlug({ city: 'Springfield', state: 'IL', lat: null, lng: null }, metros)
    expect(slug).toBeNull()
  })

  it('belongsToMetro matches assignMetroSlug for a metro', () => {
    const sale = { city: 'Louisville', state: 'KY', lat: 38.25, lng: -85.76 }
    expect(belongsToMetro(sale, TEST_GEO_LOUISVILLE, metros)).toBe(true)
    expect(belongsToMetro(sale, TEST_GEO_CHICAGO, metros)).toBe(false)
  })
})
