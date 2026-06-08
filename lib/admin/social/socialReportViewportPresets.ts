export type SocialReportViewportPreset = {
  citySlug: string
  centerLat: number
  centerLng: number
  zoom: number
  timezone: string
}

export const SOCIAL_REPORT_DEFAULT_ZOOM = 10

/** Ranked / preset-driven screenshot viewports (code-maintained). */
export const SOCIAL_REPORT_VIEWPORT_PRESETS: SocialReportViewportPreset[] = [
  /** zoom 8 (was 9): wider metro framing incl. north/west/south suburbs + lakefront */
  {
    citySlug: 'chicago-il',
    centerLat: 41.8781,
    centerLng: -87.6298,
    zoom: 8,
    timezone: 'America/Chicago',
  },
  {
    citySlug: 'dallas-tx',
    centerLat: 32.7767,
    centerLng: -96.797,
    zoom: 9,
    timezone: 'America/Chicago',
  },
  {
    citySlug: 'houston-tx',
    centerLat: 29.7604,
    centerLng: -95.3698,
    zoom: 9,
    timezone: 'America/Chicago',
  },
  {
    citySlug: 'phoenix-az',
    centerLat: 33.4484,
    centerLng: -112.074,
    zoom: 9,
    timezone: 'America/Phoenix',
  },
  {
    citySlug: 'atlanta-ga',
    centerLat: 33.749,
    centerLng: -84.388,
    zoom: 9,
    timezone: 'America/New_York',
  },
  {
    citySlug: 'austin-tx',
    centerLat: 30.2672,
    centerLng: -97.7431,
    zoom: 9,
    timezone: 'America/Chicago',
  },
  {
    citySlug: 'louisville-ky',
    centerLat: 38.2527,
    centerLng: -85.7585,
    zoom: 9,
    timezone: 'America/New_York',
  },
]

const PRESET_BY_SLUG: Record<string, SocialReportViewportPreset> = Object.fromEntries(
  SOCIAL_REPORT_VIEWPORT_PRESETS.map((preset) => [preset.citySlug, preset])
)

export function getSocialReportViewportPreset(
  citySlug: string
): SocialReportViewportPreset | null {
  return PRESET_BY_SLUG[citySlug.trim().toLowerCase()] ?? null
}

export function listSocialReportRankingPresetSlugs(): string[] {
  return SOCIAL_REPORT_VIEWPORT_PRESETS.map((preset) => preset.citySlug)
}
