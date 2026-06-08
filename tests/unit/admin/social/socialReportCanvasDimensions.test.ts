import { describe, it, expect } from 'vitest'
import {
  getSocialReportMapViewportPixelSize,
  SOCIAL_REPORT_CANVAS_WIDTH,
  SOCIAL_REPORT_MAP_PANEL_WIDTH,
} from '@/lib/admin/social/socialReportCanvasDimensions'

describe('socialReportCanvasDimensions', () => {
  it('map panel is narrower than full canvas (not edge-to-edge)', () => {
    expect(SOCIAL_REPORT_MAP_PANEL_WIDTH).toBeLessThan(SOCIAL_REPORT_CANVAS_WIDTH)
    const { width } = getSocialReportMapViewportPixelSize()
    expect(width).toBe(SOCIAL_REPORT_MAP_PANEL_WIDTH)
  })
})
