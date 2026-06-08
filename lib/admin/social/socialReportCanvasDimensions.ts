/** Canonical screenshot canvas for /admin/social (server bounds math + rendered canvas). */
export const SOCIAL_REPORT_CANVAS_WIDTH = 1440
export const SOCIAL_REPORT_CANVAS_HEIGHT = 810

/** Vertical layout shares (hero / body / footer). */
export const SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE = {
  hero: 0.34,
  body: 0.5,
  footer: 0.16,
} as const

/**
 * Contained map panel — must match the rendered map container in SocialReportCanvas.
 * Used for viewport-source-of-truth bounds (not full canvas width/height).
 */
export const SOCIAL_REPORT_MAP_PANEL_WIDTH = 920
export const SOCIAL_REPORT_MAP_PANEL_HEIGHT = 300

/** Side gutter when map panel is centered in the body row. */
export const SOCIAL_REPORT_MAP_PANEL_HORIZONTAL_GUTTER =
  (SOCIAL_REPORT_CANVAS_WIDTH - SOCIAL_REPORT_MAP_PANEL_WIDTH) / 2

/** Pixel size Mapbox renders — inventory queries use these dimensions at preset center/zoom. */
export function getSocialReportMapViewportPixelSize(): {
  width: number
  height: number
} {
  return {
    width: SOCIAL_REPORT_MAP_PANEL_WIDTH,
    height: SOCIAL_REPORT_MAP_PANEL_HEIGHT,
  }
}
