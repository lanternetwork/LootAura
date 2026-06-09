import { describe, it, expect } from 'vitest'
import {
  getSocialReportFormat,
  getSocialReportMapPanelHorizontalGutter,
  getSocialReportMapViewportPixelSize,
  SOCIAL_REPORT_FORMATS,
} from '@/lib/admin/social/socialReportFormats'

describe('socialReportFormats', () => {
  it('defines instagram-feed at 1080×1350', () => {
    const format = getSocialReportFormat('instagram-feed')
    expect(format.canvasWidth).toBe(1080)
    expect(format.canvasHeight).toBe(1350)
    expect(format.mapPanelWidth).toBeLessThan(format.canvasWidth)
  })

  it('defines vertical-story at 1080×1920', () => {
    const format = getSocialReportFormat('vertical-story')
    expect(format.canvasWidth).toBe(1080)
    expect(format.canvasHeight).toBe(1920)
    expect(format.mapPanelHeight).toBeGreaterThan(getSocialReportFormat('instagram-feed').mapPanelHeight)
  })

  it('map panel is centered within canvas width', () => {
    for (const slug of Object.keys(SOCIAL_REPORT_FORMATS) as Array<
      keyof typeof SOCIAL_REPORT_FORMATS
    >) {
      const format = getSocialReportFormat(slug)
      expect(getSocialReportMapPanelHorizontalGutter(slug)).toBe(
        (format.canvasWidth - format.mapPanelWidth) / 2
      )
      const { width, height } = getSocialReportMapViewportPixelSize(slug)
      expect(width).toBe(format.mapPanelWidth)
      expect(height).toBe(format.mapPanelHeight)
    }
  })

  it('uses vertical stack layout shares that sum to 1', () => {
    for (const slug of Object.keys(SOCIAL_REPORT_FORMATS) as Array<
      keyof typeof SOCIAL_REPORT_FORMATS
    >) {
      const shares = getSocialReportFormat(slug).layoutHeightShares
      const total = shares.header + shares.map + shares.metrics + shares.footer
      expect(total).toBeCloseTo(1, 5)
    }
  })
})
