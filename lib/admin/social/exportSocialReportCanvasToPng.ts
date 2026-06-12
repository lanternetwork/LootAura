import { buildSocialReportPngFilename } from '@/lib/admin/social/buildSocialReportPngFilename'
import {
  getSocialReportFormat,
  type SocialReportFormatSlug,
} from '@/lib/admin/social/socialReportFormats'

export const SOCIAL_REPORT_CANVAS_SELECTOR = '[data-testid="social-city-report"]'

export type SocialReportPngExportErrorCode = 'CANVAS_NOT_FOUND' | 'EXPORT_FAILED'

export class SocialReportPngExportError extends Error {
  readonly code: SocialReportPngExportErrorCode

  constructor(message: string, code: SocialReportPngExportErrorCode) {
    super(message)
    this.name = 'SocialReportPngExportError'
    this.code = code
  }
}

function triggerPngDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function exportSocialReportCanvasToPng({
  citySlug,
  formatSlug,
  canvasSelector = SOCIAL_REPORT_CANVAS_SELECTOR,
}: {
  citySlug: string
  formatSlug: SocialReportFormatSlug
  canvasSelector?: string
}): Promise<void> {
  if (typeof document === 'undefined') {
    throw new SocialReportPngExportError(
      'PNG export is only available in the browser.',
      'EXPORT_FAILED'
    )
  }

  const canvas = document.querySelector(canvasSelector)
  if (!(canvas instanceof HTMLElement)) {
    throw new SocialReportPngExportError(
      'Report canvas not found. Refresh the report and try again.',
      'CANVAS_NOT_FOUND'
    )
  }

  const format = getSocialReportFormat(formatSlug)
  const filename = buildSocialReportPngFilename({ citySlug, formatSlug })

  let dataUrl: string
  try {
    const { toPng } = await import('html-to-image')
    dataUrl = await toPng(canvas, {
      width: format.canvasWidth,
      height: format.canvasHeight,
      pixelRatio: 1,
      cacheBust: true,
    })
  } catch {
    throw new SocialReportPngExportError(
      'PNG export failed. Refresh the report and try again.',
      'EXPORT_FAILED'
    )
  }

  triggerPngDownload(dataUrl, filename)
}
