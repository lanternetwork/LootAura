/** Canonical screenshot canvas for /admin/social (server bounds math + rendered canvas). */
export const SOCIAL_REPORT_CANVAS_WIDTH = 1440
export const SOCIAL_REPORT_CANVAS_HEIGHT = 810

/** Target vertical layout shares for hero / map / footer. */
export const SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE = {
  hero: 0.35,
  map: 0.4,
  footer: 0.25,
} as const
