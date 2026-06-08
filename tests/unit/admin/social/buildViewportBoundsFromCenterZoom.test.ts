import { describe, it, expect } from 'vitest'
import { buildViewportBoundsFromCenterZoom } from '@/lib/admin/social/buildViewportBoundsFromCenterZoom'
import {
  SOCIAL_REPORT_CANVAS_HEIGHT,
  SOCIAL_REPORT_CANVAS_WIDTH,
} from '@/lib/admin/social/socialReportCanvasDimensions'

describe('buildViewportBoundsFromCenterZoom', () => {
  it('centers Chicago preset bounds around downtown', () => {
    const bounds = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 9,
      width: SOCIAL_REPORT_CANVAS_WIDTH,
      height: SOCIAL_REPORT_CANVAS_HEIGHT,
    })

    expect(bounds.north).toBeGreaterThan(41.8781)
    expect(bounds.south).toBeLessThan(41.8781)
    expect(bounds.east).toBeGreaterThan(-87.6298)
    expect(bounds.west).toBeLessThan(-87.6298)
    expect(bounds.north - bounds.south).toBeGreaterThan(0.5)
    expect(bounds.east - bounds.west).toBeGreaterThan(0.5)
  })

  it('centers Dallas preset bounds around downtown', () => {
    const bounds = buildViewportBoundsFromCenterZoom({
      centerLat: 32.7767,
      centerLng: -96.797,
      zoom: 9,
      width: SOCIAL_REPORT_CANVAS_WIDTH,
      height: SOCIAL_REPORT_CANVAS_HEIGHT,
    })

    expect(bounds.north).toBeGreaterThan(32.7767)
    expect(bounds.south).toBeLessThan(32.7767)
    expect(bounds.east).toBeGreaterThan(-96.797)
    expect(bounds.west).toBeLessThan(-96.797)
  })

  it('expands bounds when zoom decreases', () => {
    const tight = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 10,
      width: SOCIAL_REPORT_CANVAS_WIDTH,
      height: SOCIAL_REPORT_CANVAS_HEIGHT,
    })
    const wide = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 9,
      width: SOCIAL_REPORT_CANVAS_WIDTH,
      height: SOCIAL_REPORT_CANVAS_HEIGHT,
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
      width: SOCIAL_REPORT_CANVAS_WIDTH,
      height: SOCIAL_REPORT_CANVAS_HEIGHT,
    })

    expect(bounds).toEqual(explicit)
  })
})
