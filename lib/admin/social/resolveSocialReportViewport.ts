import {
  buildViewportBoundsFromCenterZoom,
  type ViewportBounds,
} from '@/lib/admin/social/buildViewportBoundsFromCenterZoom'
import {
  getSocialReportMapViewportPixelSize,
  type SocialReportFormatSlug,
} from '@/lib/admin/social/socialReportFormats'
import {
  getSocialReportZoomPreset,
  SOCIAL_REPORT_DEFAULT_ZOOM,
} from '@/lib/admin/social/socialReportViewportPresets'
import type { SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'
import type { SeoMetro } from '@/lib/seo/types'

const US_CENTER = { lat: 39.8283, lng: -98.5795 }

export type ResolvedSocialReportViewport = {
  citySlug: string
  centerLat: number
  centerLng: number
  zoom: number
  timezone: string
  bounds: ViewportBounds
  /** True when using a canonical preset (eligible for cross-city rank). */
  isRankingPreset: boolean
}

function buildResolvedViewport(options: {
  citySlug: string
  centerLat: number
  centerLng: number
  zoom: number
  timezone: string
  isRankingPreset: boolean
  format: SocialReportFormatSlug
}): ResolvedSocialReportViewport {
  return {
    citySlug: options.citySlug,
    centerLat: options.centerLat,
    centerLng: options.centerLng,
    zoom: options.zoom,
    timezone: options.timezone,
    bounds: buildViewportBoundsFromCenterZoom({
      centerLat: options.centerLat,
      centerLng: options.centerLng,
      zoom: options.zoom,
      ...getSocialReportMapViewportPixelSize(options.format),
    }),
    isRankingPreset: options.isRankingPreset,
  }
}

/** Resolve screenshot viewport for a metro (preset zoom + geography center, or fallback). */
export function resolveSocialReportViewportForMetro(
  metro: SeoMetro,
  format: SocialReportFormatSlug,
  geography: SeoMetroGeographyRow | null | undefined
): ResolvedSocialReportViewport {
  const zoomPreset = getSocialReportZoomPreset(metro.slug)
  if (zoomPreset && geography) {
    return buildResolvedViewport({
      citySlug: metro.slug,
      centerLat: geography.center_lat,
      centerLng: geography.center_lng,
      zoom: zoomPreset.zoom,
      timezone: geography.timezone,
      isRankingPreset: true,
      format,
    })
  }

  const center =
    geography != null
      ? { lat: geography.center_lat, lng: geography.center_lng }
      : US_CENTER

  return buildResolvedViewport({
    citySlug: metro.slug,
    centerLat: center.lat,
    centerLng: center.lng,
    zoom: zoomPreset?.zoom ?? SOCIAL_REPORT_DEFAULT_ZOOM,
    timezone: geography?.timezone ?? metro.timezone,
    isRankingPreset: false,
    format,
  })
}
