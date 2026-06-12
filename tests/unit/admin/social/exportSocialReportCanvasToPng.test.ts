import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exportSocialReportCanvasToPng,
  SOCIAL_REPORT_CANVAS_SELECTOR,
  SocialReportPngExportError,
} from '@/lib/admin/social/exportSocialReportCanvasToPng'

const toPngMock = vi.fn()

vi.mock('html-to-image', () => ({
  toPng: (...args: unknown[]) => toPngMock(...args),
}))

describe('exportSocialReportCanvasToPng', () => {
  beforeEach(() => {
    toPngMock.mockReset()
    toPngMock.mockResolvedValue('data:image/png;base64,abc')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('exports the social report canvas and triggers download', async () => {
    const canvas = document.createElement('div')
    canvas.setAttribute('data-testid', 'social-city-report')
    document.body.appendChild(canvas)

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await exportSocialReportCanvasToPng({
      citySlug: 'austin-tx',
      formatSlug: 'instagram-feed',
    })

    expect(toPngMock).toHaveBeenCalledWith(canvas, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      cacheBust: true,
    })
    expect(clickSpy).toHaveBeenCalled()
  })

  it('throws CANVAS_NOT_FOUND when canvas is missing', async () => {
    await expect(
      exportSocialReportCanvasToPng({
        citySlug: 'austin-tx',
        formatSlug: 'instagram-feed',
        canvasSelector: SOCIAL_REPORT_CANVAS_SELECTOR,
      })
    ).rejects.toMatchObject({
      code: 'CANVAS_NOT_FOUND',
      message: 'Report canvas not found. Refresh the report and try again.',
    })
  })

  it('throws EXPORT_FAILED when html-to-image rejects', async () => {
    const canvas = document.createElement('div')
    canvas.setAttribute('data-testid', 'social-city-report')
    document.body.appendChild(canvas)
    toPngMock.mockRejectedValue(new Error('capture failed'))

    await expect(
      exportSocialReportCanvasToPng({
        citySlug: 'austin-tx',
        formatSlug: 'vertical-story',
      })
    ).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
      message: 'PNG export failed. Refresh the report and try again.',
    })
  })
})

describe('SocialReportPngExportError', () => {
  it('exposes structured error code', () => {
    const error = new SocialReportPngExportError('test', 'EXPORT_FAILED')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('EXPORT_FAILED')
  })
})
