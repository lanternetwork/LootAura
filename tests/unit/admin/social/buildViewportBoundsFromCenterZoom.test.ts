import { describe, it, expect } from 'vitest'
import { buildViewportBoundsFromCenterZoom } from '@/lib/admin/social/buildViewportBoundsFromCenterZoom'
import {
  getSocialReportMapViewportPixelSize,
  SOCIAL_REPORT_MAP_PANEL_HEIGHT,
  SOCIAL_REPORT_MAP_PANEL_WIDTH,
} from '@/lib/admin/social/socialReportCanvasDimensions'

describe('buildViewportBoundsFromCenterZoom', () => {
  const mapPanel = {
    width: SOCIAL_REPORT_MAP_PANEL_WIDTH,
    height: SOCIAL_REPORT_MAP_PANEL_HEIGHT,
  }

  it('centers Chicago preset bounds around downtown', () => {
    const bounds = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 8,
      ...mapPanel,
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
      ...mapPanel,
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
      zoom: 9,
      ...mapPanel,
    })
    const wide = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 8,
      ...mapPanel,
    })

    expect(wide.north - wide.south).toBeGreaterThan(tight.north - tight.south)
    expect(wide.east - wide.west).toBeGreaterThan(tight.east - tight.west)
  })

  it('defaults to contained map panel dimensions', () => {
    const bounds = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 8,
    })

    const explicit = buildViewportBoundsFromCenterZoom({
      centerLat: 41.8781,
      centerLng: -87.6298,
      zoom: 8,
      ...getSocialReportMapViewportPixelSize(),
    })

    expect(bounds).toEqual(explicit)
  })
})
