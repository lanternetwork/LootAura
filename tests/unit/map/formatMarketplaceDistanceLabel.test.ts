import { describe, it, expect } from 'vitest'
import {
  formatMarketplaceDistanceFromUserMeters,
  getMarketplaceDistanceLabel,
  getMarketplaceDistanceFromUserLabel,
} from '@/lib/map/formatMarketplaceDistanceFromUser'

const METERS_PER_MILE = 1609.344
const viewport = { center: { lat: 38.25, lng: -85.75 }, zoom: 11 }

describe('getMarketplaceDistanceLabel', () => {
  it('prefers sale.distance_m from API (matches list sort key)', () => {
    const label = getMarketplaceDistanceLabel(
      { lat: 38.26, lng: -85.76, distance_m: Math.round(METERS_PER_MILE * 2.3) },
      viewport
    )
    expect(label).toBe('2.3 mi away')
  })

  it('distance_m wins over viewport center when they would differ', () => {
    const sale = {
      lat: 38.26,
      lng: -85.76,
      distance_m: Math.round(METERS_PER_MILE * 0.5),
    }
    const farViewport = { center: { lat: 40.0, lng: -90.0 }, zoom: 10 }
    const label = getMarketplaceDistanceLabel(sale, farViewport)
    expect(label).toBe('0.5 mi away')
  })

  it('falls back to viewport center when distance_m is absent', () => {
    const label = getMarketplaceDistanceLabel({ lat: 38.26, lng: -85.76 }, viewport)
    expect(label).toMatch(/^(Nearby|\d+(\.\d)? mi away)$/)
  })

  it('returns null without distance_m and without viewport', () => {
    expect(getMarketplaceDistanceLabel({ lat: 38.26, lng: -85.76 }, null)).toBeNull()
  })

  it('labels sort consistently with distance_m ordering', () => {
    const nearer = { id: 'a', lat: 38.26, lng: -85.76, distance_m: 500 }
    const farther = { id: 'b', lat: 38.3, lng: -85.8, distance_m: 5000 }
    const nearerLabel = getMarketplaceDistanceLabel(nearer, viewport)
    const fartherLabel = getMarketplaceDistanceLabel(farther, viewport)
    expect(nearerLabel).toBeTruthy()
    expect(fartherLabel).toBeTruthy()
    expect(formatMarketplaceDistanceFromUserMeters(nearer.distance_m)).toBe(nearerLabel)
    expect(formatMarketplaceDistanceFromUserMeters(farther.distance_m)).toBe(fartherLabel)
  })
})

describe('getMarketplaceDistanceFromUserLabel (non-marketplace)', () => {
  it('still computes from user GPS when used directly', () => {
    const user = { lat: 38.25, lng: -85.75 }
    const label = getMarketplaceDistanceFromUserLabel(user, { lat: 38.26, lng: -85.76 })
    expect(label).toMatch(/^(Nearby|\d+(\.\d)? mi away)$/)
  })
})
