import { validateNativeCoordinates } from '@/lib/ingestion/spatial/validateNativeCoordinates'

export type EsnetNativeCoords = {
  lat: number
  lng: number
}

export function readEsnetNativeCoordsFromListingRawPayload(
  rawPayload: unknown
): EsnetNativeCoords | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null
  const payload = rawPayload as Record<string, unknown>
  const lat = payload.esnetNativeLat
  const lng = payload.esnetNativeLng
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null
  }
  return { lat, lng }
}

export function validateEsnetNativeCoords(input: {
  nativeCoords: EsnetNativeCoords
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
