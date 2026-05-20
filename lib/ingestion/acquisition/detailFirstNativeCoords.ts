import type { YstmDetailPageParsed } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { validateNativeCoordinates } from '@/lib/ingestion/spatial/validateNativeCoordinates'

export type DetailFirstNativeCoords = {
  lat: number
  lng: number
}

export function readYstmNativeCoordsFromListingRawPayload(
  rawPayload: unknown
): DetailFirstNativeCoords | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null
  const payload = rawPayload as Record<string, unknown>
  const lat = payload.ystmNativeLat
  const lng = payload.ystmNativeLng
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  return { lat, lng }
}

export function validateDetailFirstNativeCoords(input: {
  nativeCoords: DetailFirstNativeCoords
  city: string
  state: string
  sourceUrl: string
}): boolean {
  return validateNativeCoordinates({
    lat: input.nativeCoords.lat,
    lng: input.nativeCoords.lng,
    city: input.city,
    state: input.state,
    sourceUrl: input.sourceUrl,
  }).ok
}

export function nativeCoordsFromDetailPage(
  detailPage: Pick<YstmDetailPageParsed, 'nativeCoords'>
): DetailFirstNativeCoords | null {
  if (!detailPage.nativeCoords) return null
  return { lat: detailPage.nativeCoords.lat, lng: detailPage.nativeCoords.lng }
}
