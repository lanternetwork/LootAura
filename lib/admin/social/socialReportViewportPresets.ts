export type SocialReportZoomPreset = {
  citySlug: string
  zoom: number
}

export const SOCIAL_REPORT_DEFAULT_ZOOM = 10

/** Map framing zoom per ranked social metro (center from seo_metro_geography). */
export const SOCIAL_REPORT_VIEWPORT_PRESETS: SocialReportZoomPreset[] = [
  { citySlug: 'chicago-il', zoom: 8 },
  { citySlug: 'dallas-tx', zoom: 8 },
  { citySlug: 'houston-tx', zoom: 9 },
  { citySlug: 'phoenix-az', zoom: 9 },
  { citySlug: 'atlanta-ga', zoom: 9 },
  { citySlug: 'austin-tx', zoom: 9 },
  { citySlug: 'louisville-ky', zoom: 9 },
]

const PRESET_BY_SLUG: Record<string, SocialReportZoomPreset> = Object.fromEntries(
  SOCIAL_REPORT_VIEWPORT_PRESETS.map((preset) => [preset.citySlug, preset])
)

export function getSocialReportZoomPreset(citySlug: string): SocialReportZoomPreset | null {
  return PRESET_BY_SLUG[citySlug.trim().toLowerCase()] ?? null
}

export function listSocialReportRankingPresetSlugs(): string[] {
  return SOCIAL_REPORT_VIEWPORT_PRESETS.map((preset) => preset.citySlug)
}

/** @deprecated Use getSocialReportZoomPreset */
export function getSocialReportViewportPreset(citySlug: string): SocialReportZoomPreset | null {
  return getSocialReportZoomPreset(citySlug)
}
