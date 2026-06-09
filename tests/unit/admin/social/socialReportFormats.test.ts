import { describe, it, expect } from 'vitest'
import {
  getSocialReportFormat,
  getSocialReportLayoutHeightTotal,
  getSocialReportMapPanelHorizontalGutter,
  getSocialReportMapViewportPixelSize,
  SOCIAL_REPORT_FORMATS,
} from '@/lib/admin/social/socialReportFormats'

describe('socialReportFormats', () => {
  it('defines instagram-feed at 1080×1350 with template-aligned section bands', () => {
    const format = getSocialReportFormat('instagram-feed')
    expect(format.canvasWidth).toBe(1080)
    expect(format.canvasHeight).toBe(1350)
    expect(format.mapPanelWidth).toBe(format.canvasWidth)
    expect(format.mapEdgeToEdge).toBe(true)
    expect(format.layoutHeightShares.header).toBeGreaterThanOrEqual(0.18)
    expect(format.layoutHeightShares.header).toBeLessThanOrEqual(0.22)
    expect(format.layoutHeightShares.map).toBeGreaterThanOrEqual(0.45)
    expect(format.layoutHeightShares.map).toBeLessThanOrEqual(0.5)
    expect(format.layoutHeightShares.metrics).toBeGreaterThanOrEqual(0.2)
    expect(format.layoutHeightShares.metrics).toBeLessThanOrEqual(0.24)
    expect(format.layoutHeightShares.footer).toBeGreaterThanOrEqual(0.05)
    expect(format.layoutHeightShares.footer).toBeLessThanOrEqual(0.07)
    expect(format.sectionGapShare).toBeUndefined()
    expect(format.mapPanelHeight).toBe(
      Math.round(format.layoutHeightShares.map * format.canvasHeight)
    )
    expect(getSocialReportLayoutHeightTotal('instagram-feed')).toBeCloseTo(1, 5)
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
      const expectedGutter = format.mapEdgeToEdge
        ? 0
        : (format.canvasWidth - format.mapPanelWidth) / 2
      expect(getSocialReportMapPanelHorizontalGutter(slug)).toBe(expectedGutter)
      const { width, height } = getSocialReportMapViewportPixelSize(slug)
      expect(width).toBe(format.mapPanelWidth)
      expect(height).toBe(format.mapPanelHeight)
    }
  })

  it('uses vertical stack layout shares that sum to 1', () => {
    for (const slug of Object.keys(SOCIAL_REPORT_FORMATS) as Array<
      keyof typeof SOCIAL_REPORT_FORMATS
    >) {
      expect(getSocialReportLayoutHeightTotal(slug)).toBeCloseTo(1, 5)
    }
  })
})
