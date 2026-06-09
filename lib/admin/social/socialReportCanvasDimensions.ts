/**
 * @deprecated Use socialReportFormats.ts — 1440×810 retired; formats are format-specific.
 * Re-exports instagram-feed dimensions for any legacy references during migration.
 */
export {
  getSocialReportFormat,
  getSocialReportMapPanelHorizontalGutter,
  getSocialReportMapViewportPixelSize,
  type SocialReportFormatSlug,
} from '@/lib/admin/social/socialReportFormats'

import { getSocialReportFormat } from '@/lib/admin/social/socialReportFormats'

const instagramFeed = getSocialReportFormat('instagram-feed')

export const SOCIAL_REPORT_CANVAS_WIDTH = instagramFeed.canvasWidth
export const SOCIAL_REPORT_CANVAS_HEIGHT = instagramFeed.canvasHeight
export const SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE = instagramFeed.layoutHeightShares
export const SOCIAL_REPORT_MAP_PANEL_WIDTH = instagramFeed.mapPanelWidth
export const SOCIAL_REPORT_MAP_PANEL_HEIGHT = instagramFeed.mapPanelHeight
export const SOCIAL_REPORT_MAP_PANEL_HORIZONTAL_GUTTER =
  (instagramFeed.canvasWidth - instagramFeed.mapPanelWidth) / 2
