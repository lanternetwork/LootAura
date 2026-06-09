import { describe, it, expect } from 'vitest'
import {
  getSocialReportFormat,
  getSocialReportMapPanelHorizontalGutter,
  getSocialReportMapViewportPixelSize,
} from '@/lib/admin/social/socialReportFormats'
import {
  SOCIAL_REPORT_CANVAS_HEIGHT,
  SOCIAL_REPORT_CANVAS_WIDTH,
  SOCIAL_REPORT_MAP_PANEL_HEIGHT,
  SOCIAL_REPORT_MAP_PANEL_HORIZONTAL_GUTTER,
  SOCIAL_REPORT_MAP_PANEL_WIDTH,
} from '@/lib/admin/social/socialReportCanvasDimensions'

/** Legacy re-exports point at instagram-feed dimensions. */
describe('socialReportCanvasDimensions', () => {
  it('re-exports instagram-feed as legacy canvas constants', () => {
    const instagram = getSocialReportFormat('instagram-feed')

    expect(SOCIAL_REPORT_CANVAS_WIDTH).toBe(instagram.canvasWidth)
    expect(SOCIAL_REPORT_CANVAS_HEIGHT).toBe(instagram.canvasHeight)
    expect(SOCIAL_REPORT_MAP_PANEL_WIDTH).toBe(instagram.mapPanelWidth)
    expect(SOCIAL_REPORT_MAP_PANEL_HORIZONTAL_GUTTER).toBe(
      getSocialReportMapPanelHorizontalGutter('instagram-feed')
    )
    const { width, height } = getSocialReportMapViewportPixelSize('instagram-feed')
    expect(width).toBe(SOCIAL_REPORT_MAP_PANEL_WIDTH)
    expect(height).toBe(SOCIAL_REPORT_MAP_PANEL_HEIGHT)
  })
})
