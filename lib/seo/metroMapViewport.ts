import {
  getSocialReportZoomPreset,
  SOCIAL_REPORT_DEFAULT_ZOOM,
} from '@/lib/admin/social/socialReportViewportPresets'
import type { SeoMetroGeographyRow } from '@/lib/seo/metroGeographyTypes'

export type MetroMapViewport = {
  centerLat: number
  centerLng: number
  zoom: number
}

export type MetroMapPin = {
  id: string
  lat: number
  lng: number
  is_featured?: boolean
}

/** Fixed map viewport for SEO metro pages and shared snapshot maps (no runtime geo math). */
export function resolveMetroMapViewport(
  metroSlug: string,
  geography: Pick<SeoMetroGeographyRow, 'center_lat' | 'center_lng'> | null | undefined
): MetroMapViewport | null {
  if (!geography) return null

  const zoomPreset = getSocialReportZoomPreset(metroSlug)
  return {
    centerLat: geography.center_lat,
    centerLng: geography.center_lng,
    zoom: zoomPreset?.zoom ?? SOCIAL_REPORT_DEFAULT_ZOOM,
  }
}

export function salesToMetroMapPins(
  sales: Array<{ id: string; lat?: number | null; lng?: number | null; is_featured?: boolean }>
): MetroMapPin[] {
  return sales
    .filter(
      (sale): sale is typeof sale & { lat: number; lng: number } =>
        sale.lat != null && sale.lng != null
    )
    .map((sale) => ({
      id: sale.id,
      lat: sale.lat,
      lng: sale.lng,
      is_featured: sale.is_featured ?? false,
    }))
}
