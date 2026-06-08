import { describe, it, expect } from 'vitest'
import { buildViewportBoundsFromCenterZoom } from '@/lib/admin/social/buildViewportBoundsFromCenterZoom'
import {
  SOCIAL_REPORT_CANVAS_HEIGHT,
  SOCIAL_REPORT_CANVAS_WIDTH,
} from '@/lib/admin/social/socialReportCanvasDimensions'

describe('buildViewportBoundsFromCenterZoom', () => {
  const canvas = {
    width: SOCIAL_REPORT_CANVAS_WIDTH,
    height: SOCIAL_REPORT_CANVAS_HEIGHT,
  }

  it('centers Chicago preset bounds around downtown', () => {
    const bounds = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 9,
      ...canvas,
    })

    expect(bounds.north).toBeGreaterThan(bounds.south)
    expect(bounds.east).toBeGreaterThan(bounds.west)
    expect((bounds.north + bounds.south) / 2).toBeCloseTo(41.8781, 0)
    expect((bounds.east + bounds.west) / 2).toBeCloseTo(-87.6298, 0)
    expect(bounds.north - bounds.south).toBeGreaterThan(0.5)
    expect(bounds.east - bounds.west).toBeGreaterThan(0.5)
  })

  it('centers Dallas preset bounds around downtown', () => {
    const bounds = buildViewportBoundsFromCenterZoom({
      centerLat: 32.7767,
      centerLng: -96.797,
      zoom: 9,
      ...canvas,
    })

    expect(bounds.north).toBeGreaterThan(bounds.south)
    expect(bounds.east).toBeGreaterThan(bounds.west)
    expect((bounds.north + bounds.south) / 2).toBeCloseTo(32.7767, 0)
    expect((bounds.east + bounds.west) / 2).toBeCloseTo(-96.797, 0)
  })

  it('expands bounds when zoom decreases', () => {
    const tight = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 10,
      ...canvas,
    })
    const wide = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 9,
      ...canvas,
    })

    expect(wide.north - wide.south).toBeGreaterThan(tight.north - tight.south)
    expect(wide.east - wide.west).toBeGreaterThan(tight.east - tight.west)
  })

  it('uses canonical canvas dimensions by default', () => {
    const bounds = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 9,
    })

    const explicit = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 9,
      ...canvas,
    })

    expect(bounds).toEqual(explicit)
  })
})
