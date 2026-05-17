import { describe, expect, it } from 'vitest'
import {
  clampBoundsToApiLimit,
  getBoundsSpanDegrees,
  isLowZoomForDeferredFetch,
  prepareFetchBbox,
  MAX_BBOX_SPAN_DEGREES,
  viewportExceedsApiLimitAfterBuffer,
} from '@/lib/map/fetchBbox'
import { expandBounds, MAP_BUFFER_FACTOR } from '@/lib/map/bounds'
import { validateBboxSize } from '@/lib/shared/bboxValidation'
import { computeSSRInitialSales } from '@/lib/map/ssrInitialSales'

describe('fetchBbox', () => {
  const nationwideViewport = {
    west: -125,
    south: 24,
    east: -66,
    north: 50,
  }

  it('prepareFetchBbox never exceeds API max span after buffer', () => {
    const { fetchBounds } = prepareFetchBbox(nationwideViewport)
    const { latSpan, lngSpan } = getBoundsSpanDegrees(fetchBounds)
    expect(latSpan).toBeLessThanOrEqual(MAX_BBOX_SPAN_DEGREES)
    expect(lngSpan).toBeLessThanOrEqual(MAX_BBOX_SPAN_DEGREES)
    expect(validateBboxSize(fetchBounds)).toBeNull()
  })

  it('clampBoundsToApiLimit preserves center when clamping', () => {
    const { bounds, wasClamped } = clampBoundsToApiLimit(nationwideViewport)
    expect(wasClamped).toBe(true)
    const centerLat = (bounds.north + bounds.south) / 2
    const centerLng = (bounds.east + bounds.west) / 2
    expect(centerLat).toBeCloseTo((nationwideViewport.north + nationwideViewport.south) / 2, 2)
    expect(centerLng).toBeCloseTo((nationwideViewport.east + nationwideViewport.west) / 2, 2)
  })

  it('city-scale viewport is not clamped after prepareFetchBbox', () => {
    const cityViewport = { west: -86.1, south: 39.9, east: -85.9, north: 40.1 }
    const { fetchBounds, wasClamped } = prepareFetchBbox(cityViewport)
    expect(wasClamped).toBe(false)
    expect(validateBboxSize(fetchBounds)).toBeNull()
  })

  it('isLowZoomForDeferredFetch defers proactive fetch below threshold', () => {
    expect(isLowZoomForDeferredFetch(4)).toBe(true)
    expect(isLowZoomForDeferredFetch(7.9)).toBe(true)
    expect(isLowZoomForDeferredFetch(8)).toBe(false)
    expect(isLowZoomForDeferredFetch(12)).toBe(false)
  })

  it('viewportExceedsApiLimitAfterBuffer detects continental viewport', () => {
    expect(viewportExceedsApiLimitAfterBuffer(nationwideViewport)).toBe(true)
    const small = { west: -86, south: 39, east: -85, north: 40 }
    expect(viewportExceedsApiLimitAfterBuffer(small)).toBe(false)
  })

  it('expanded city viewport stays within API limit', () => {
    const city = { west: -86, south: 39, east: -85, north: 40 }
    const expanded = expandBounds(city, MAP_BUFFER_FACTOR)
    expect(validateBboxSize(expanded)).toBeNull()
  })
})

describe('computeSSRInitialSales low zoom', () => {
  it('skips SSR seed when URL zoom is nationwide-low', async () => {
    const result = await computeSSRInitialSales(
      { lat: 39.8283, lng: -98.5795 },
      'http://localhost:3000',
      '4',
      { dateRange: 'any', categories: [], distance: 10 }
    )
    expect(result.initialSales).toEqual([])
    expect(result.initialBufferedBounds).toBeNull()
  })
})
