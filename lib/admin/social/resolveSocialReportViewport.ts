import {
  buildViewportBoundsFromCenterZoom,
  type ViewportBounds,
} from '@/lib/admin/social/buildViewportBoundsFromCenterZoom'
import {
  getSocialReportMapViewportPixelSize,
  type SocialReportFormatSlug,
} from '@/lib/admin/social/socialReportFormats'
import { getKnownMetroMarketAnchor } from '@/lib/admin/social/metroMarketGeography'
import {
  getSocialReportViewportPreset,
  SOCIAL_REPORT_DEFAULT_ZOOM,
} from '@/lib/admin/social/socialReportViewportPresets'
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

/** Resolve screenshot viewport for a metro (preset or conservative fallback). */
export function resolveSocialReportViewportForMetro(
  metro: SeoMetro,
  format: SocialReportFormatSlug
): ResolvedSocialReportViewport {
  const preset = getSocialReportViewportPreset(metro.slug)
  if (preset) {
    return buildResolvedViewport({
      citySlug: preset.citySlug,
      centerLat: preset.centerLat,
      centerLng: preset.centerLng,
      zoom: preset.zoom,
      timezone: preset.timezone,
      isRankingPreset: true,
      format,
    })
  }

  const anchor = getKnownMetroMarketAnchor(metro.slug)
  const center = anchor ?? US_CENTER

  return buildResolvedViewport({
    citySlug: metro.slug,
    centerLat: center.lat,
    centerLng: center.lng,
    zoom: SOCIAL_REPORT_DEFAULT_ZOOM,
    timezone: metro.timezone,
    isRankingPreset: false,
    format,
  })
}
