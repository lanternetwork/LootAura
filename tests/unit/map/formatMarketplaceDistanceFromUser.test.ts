import { describe, it, expect } from 'vitest'
import {
  formatMarketplaceDistanceFromUserMeters,
  getMarketplaceDistanceFromUserLabel,
} from '@/lib/map/formatMarketplaceDistanceFromUser'

const METERS_PER_MILE = 1609.344

describe('formatMarketplaceDistanceFromUserMeters', () => {
  it('shows Nearby under 0.1 miles', () => {
    expect(formatMarketplaceDistanceFromUserMeters(0)).toBe('Nearby')
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 0.09)).toBe('Nearby')
  })

  it('shows one decimal place from 0.1 to 99.9 miles', () => {
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 0.8)).toBe('0.8 mi away')
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 2.34)).toBe('2.3 mi away')
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 14.76)).toBe('14.8 mi away')
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 0.1)).toBe('0.1 mi away')
  })

  it('shows whole miles at 100+ miles', () => {
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 104.2)).toBe('104 mi away')
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 153.6)).toBe('154 mi away')
    expect(formatMarketplaceDistanceFromUserMeters(METERS_PER_MILE * 100)).toBe('100 mi away')
  })
})

describe('getMarketplaceDistanceFromUserLabel', () => {
  const user = { lat: 38.25, lng: -85.75 }

  it('returns null without user location', () => {
    expect(getMarketplaceDistanceFromUserLabel(null, { lat: 38.3, lng: -85.8 })).toBeNull()
  })

  it('returns null with invalid sale coordinates', () => {
    expect(getMarketplaceDistanceFromUserLabel(user, { lat: null, lng: -85.8 })).toBeNull()
    expect(getMarketplaceDistanceFromUserLabel(user, { lat: 999, lng: 0 })).toBeNull()
  })

  it('computes distance from user to sale using haversine', () => {
    const label = getMarketplaceDistanceFromUserLabel(user, { lat: 38.26, lng: -85.76 })
    expect(label).toMatch(/^(Nearby|\d+(\.\d)? mi away)$/)
  })
})
