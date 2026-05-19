import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import { lookupAddressGeocodeCache } from '@/lib/ingestion/spatial/addressGeocodeCache'
import { extractYstmNativeCoordinatesFromHtml } from '@/lib/ingestion/spatial/extractYstmNativeCoordinates'
import { validateNativeCoordinates } from '@/lib/ingestion/spatial/validateNativeCoordinates'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'
import type { YstmDetailFirstFallbackReason } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'

/**
 * Classify why detail-first spatial resolution would fail (diagnostics only).
 * Mirrors lookupSpatialCoordinates tiers without changing geocode behavior.
 */
export async function classifyDetailFirstSpatialFailure(input: {
  addressRaw: string | null
  normalizedAddress?: string | null
  city: string
  state: string
  sourceUrl?: string | null
  pageHtml?: string | null
}): Promise<YstmDetailFirstFallbackReason> {
  const city = input.city?.trim() ?? ''
  const state = input.state?.trim() ?? ''
  if (!city || !state || !isAddressGeocodeReady(input.addressRaw)) {
    return 'address_validation_failed'
  }

  const normalized = normalizeAddressForPublish(input.addressRaw ?? null, city, state)
  if (!normalized) {
    return 'address_validation_failed'
  }
  try {
    validateResolvedAddressForPublish(normalized, city, state)
  } catch {
    return 'address_validation_failed'
  }

  const cached = await lookupAddressGeocodeCache({
    addressRaw: input.addressRaw,
    normalizedAddress: input.normalizedAddress,
    city,
    state,
  })
  if (cached) {
    return 'spatial_lookup_failed'
  }

  const html = input.pageHtml?.trim()
  if (!html) {
    return 'spatial_lookup_failed'
  }

  const native = extractYstmNativeCoordinatesFromHtml(html)
  if (!native) {
    return 'spatial_lookup_failed'
  }

  const validation = validateNativeCoordinates({
    lat: native.lat,
    lng: native.lng,
    city,
    state,
    sourceUrl: input.sourceUrl,
  })
  if (!validation.ok) {
    return 'native_coords_invalid'
  }

  return 'spatial_lookup_failed'
}
