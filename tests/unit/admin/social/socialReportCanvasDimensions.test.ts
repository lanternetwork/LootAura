import { describe, it, expect } from 'vitest'
import {
  getSocialReportMapViewportPixelSize,
  SOCIAL_REPORT_CANVAS_WIDTH,
  SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE,
  SOCIAL_REPORT_MAP_PANEL_HEIGHT,
  SOCIAL_REPORT_MAP_PANEL_HORIZONTAL_GUTTER,
  SOCIAL_REPORT_MAP_PANEL_WIDTH,
} from '@/lib/admin/social/socialReportCanvasDimensions'

describe('socialReportCanvasDimensions', () => {
  it('map panel is narrower than full canvas with centered gutters', () => {
    expect(SOCIAL_REPORT_MAP_PANEL_WIDTH).toBeLessThan(SOCIAL_REPORT_CANVAS_WIDTH)
    expect(SOCIAL_REPORT_MAP_PANEL_HORIZONTAL_GUTTER).toBe(
      (SOCIAL_REPORT_CANVAS_WIDTH - SOCIAL_REPORT_MAP_PANEL_WIDTH) / 2
    )
    const { width, height } = getSocialReportMapViewportPixelSize()
    expect(width).toBe(SOCIAL_REPORT_MAP_PANEL_WIDTH)
    expect(height).toBe(SOCIAL_REPORT_MAP_PANEL_HEIGHT)
  })

  it('uses vertical stack layout shares that sum to 1', () => {
    const total =
      SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.header +
      SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.map +
      SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.metrics +
      SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.footer
    expect(total).toBeCloseTo(1, 5)
  })
})
