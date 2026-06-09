export type SocialReportFormatSlug = 'instagram-feed' | 'vertical-story'

export type SocialReportLayoutHeightShare = {
  header: number
  map: number
  metrics: number
  footer: number
}

export type SocialReportFormatDefinition = {
  slug: SocialReportFormatSlug
  label: string
  canvasWidth: number
  canvasHeight: number
  mapPanelWidth: number
  mapPanelHeight: number
  /** Full-bleed map band (no side gutter, no rounded frame). */
  mapEdgeToEdge?: boolean
  layoutHeightShares: SocialReportLayoutHeightShare
  /** Per-gap white space between stacked sections (instagram uses three interstitial gaps). */
  sectionGapShare?: number
}

export const SOCIAL_REPORT_FORMATS: Record<
  SocialReportFormatSlug,
  SocialReportFormatDefinition
> = {
  'instagram-feed': {
    slug: 'instagram-feed',
    label: 'Instagram Feed (4:5)',
    canvasWidth: 1080,
    canvasHeight: 1350,
    mapPanelWidth: 1080,
    /** 48% of canvas — matches map band; viewport SOT */
    mapPanelHeight: 648,
    mapEdgeToEdge: true,
    layoutHeightShares: {
      header: 0.24,
      map: 0.48,
      metrics: 0.22,
      footer: 0.06,
    },
  },
  'vertical-story': {
    slug: 'vertical-story',
    label: 'Vertical Story (9:16)',
    canvasWidth: 1080,
    canvasHeight: 1920,
    mapPanelWidth: 980,
    mapPanelHeight: 780,
    layoutHeightShares: {
      header: 0.24,
      map: 0.42,
      metrics: 0.24,
      footer: 0.1,
    },
  },
}

export const DEFAULT_SOCIAL_REPORT_FORMAT: SocialReportFormatSlug = 'instagram-feed'

export function isSocialReportFormatSlug(value: string): value is SocialReportFormatSlug {
  return value in SOCIAL_REPORT_FORMATS
}

export function getSocialReportFormat(slug: SocialReportFormatSlug): SocialReportFormatDefinition {
  return SOCIAL_REPORT_FORMATS[slug]
}

export function listSocialReportFormatOptions(): Array<{
  slug: SocialReportFormatSlug
  label: string
}> {
  return Object.values(SOCIAL_REPORT_FORMATS).map((format) => ({
    slug: format.slug,
    label: format.label,
  }))
}

/** Mapbox render size — inventory queries use these dimensions at preset center/zoom. */
export function getSocialReportMapViewportPixelSize(format: SocialReportFormatSlug): {
  width: number
  height: number
} {
  const definition = getSocialReportFormat(format)
  return {
    width: definition.mapPanelWidth,
    height: definition.mapPanelHeight,
  }
}

export function getSocialReportMapPanelHorizontalGutter(format: SocialReportFormatSlug): number {
  const definition = getSocialReportFormat(format)
  if (definition.mapEdgeToEdge) {
    return 0
  }
  return (definition.canvasWidth - definition.mapPanelWidth) / 2
}

export function getSocialReportLayoutHeightTotal(format: SocialReportFormatSlug): number {
  const definition = getSocialReportFormat(format)
  const { header, map, metrics, footer } = definition.layoutHeightShares
  const sectionGaps = definition.sectionGapShare ? definition.sectionGapShare * 3 : 0
  return header + map + metrics + footer + sectionGaps
}
