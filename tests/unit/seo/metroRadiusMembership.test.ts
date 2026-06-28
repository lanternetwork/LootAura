import { describe, it, expect } from 'vitest'
import {
  distanceToMetroCenterMiles,
  isWithinMetroRadius,
  listMetroSlugsWithinRadius,
} from '@/lib/seo/metroRadiusMembership'
import { TEST_GEO_LOUISVILLE } from './metroGeographyTestFixtures'

describe('metroRadiusMembership', () => {
  it('includes Jeffersontown coordinates within Louisville 25 mi radius', () => {
    expect(isWithinMetroRadius(38.22, -85.72, TEST_GEO_LOUISVILLE)).toBe(true)
  })

  it('excludes Bardstown at ~35 miles from Louisville center', () => {
    expect(isWithinMetroRadius(37.8092, -85.4669, TEST_GEO_LOUISVILLE)).toBe(false)
  })

  it('includes a sale in every metro whose radius contains it', () => {
    const overlapA = {
      ...TEST_GEO_LOUISVILLE,
      slug: 'alpha-metro',
      center_lat: 40,
      center_lng: -86,
      radius_miles: 25,
    }
    const overlapB = {
      ...TEST_GEO_LOUISVILLE,
      slug: 'beta-metro',
      center_lat: 40.2,
      center_lng: -86.2,
      radius_miles: 25,
    }

    const slugs = listMetroSlugsWithinRadius(40.1, -86.1, [overlapB, overlapA])
    expect(slugs).toEqual(['alpha-metro', 'beta-metro'])
  })

  it('reports distance in miles from metro center', () => {
    const miles = distanceToMetroCenterMiles(38.25, -85.76, TEST_GEO_LOUISVILLE)
    expect(miles).toBeGreaterThan(0)
    expect(miles).toBeLessThan(5)
  })
})
