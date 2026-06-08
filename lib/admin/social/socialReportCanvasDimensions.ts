/** Canonical screenshot canvas for /admin/social (server bounds math + rendered canvas). */
export const SOCIAL_REPORT_CANVAS_WIDTH = 1440
export const SOCIAL_REPORT_CANVAS_HEIGHT = 810

/** Vertical layout shares (header / map / metrics / footer) on white canvas. */
export const SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE = {
  header: 0.27,
  map: 0.47,
  metrics: 0.18,
  footer: 0.08,
} as const

/**
 * Centered map panel — must match the rendered map container in SocialReportCanvas.
 * Used for viewport-source-of-truth bounds (not full canvas width/height).
 */
export const SOCIAL_REPORT_MAP_PANEL_WIDTH = 1280
export const SOCIAL_REPORT_MAP_PANEL_HEIGHT = 360

/** Side gutter when map panel is centered in the map section. */
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
