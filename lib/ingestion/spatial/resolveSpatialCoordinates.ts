import {
  confidenceForPrecision,
  type CoordinatePrecision,
  type GeocodeConfidence,
  type GeocodeMethod,
} from '@/lib/geocode/geocodePrecisionPolicy'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import { lookupAddressGeocodeCache } from '@/lib/ingestion/spatial/addressGeocodeCache'
import { extractYstmNativeCoordinatesFromHtml } from '@/lib/ingestion/spatial/extractYstmNativeCoordinates'
import { validateNativeCoordinates } from '@/lib/ingestion/spatial/validateNativeCoordinates'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export type SpatialCoordinateResolution = {
  lat: number
  lng: number
  geocode_confidence: GeocodeConfidence
  coordinate_precision: CoordinatePrecision
  geocode_method: GeocodeMethod
  resolutionSource: 'address_geocode_cache' | 'ystm_provider_native'
}

function isPublishableAddressForSpatial(
  addressRaw: string | null | undefined,
  city: string,
  state: string
): boolean {
  if (!isAddressGeocodeReady(addressRaw)) return false
  const normalized = normalizeAddressForPublish(addressRaw ?? null, city, state)
  if (!normalized) return false
  try {
    validateResolvedAddressForPublish(normalized, city, state)
    return true
  } catch {
    return false
  }
}

/**
 * Tier order: durable cache → YSTM native (page HTML). Does not call Nominatim.
 */
export async function lookupSpatialCoordinates(input: {
  addressRaw: string | null
  normalizedAddress?: string | null
  city: string
  state: string
  sourceUrl?: string | null
  pageHtml?: string | null
  telemetryContext?: Record<string, unknown>
}): Promise<SpatialCoordinateResolution | null> {
  const city = input.city?.trim() ?? ''
  const state = input.state?.trim() ?? ''
  if (!city || !state || !isPublishableAddressForSpatial(input.addressRaw, city, state)) {
    return null
  }

  const cached = await lookupAddressGeocodeCache({
    addressRaw: input.addressRaw,
    normalizedAddress: input.normalizedAddress,
    city,
    state,
  })
  if (cached) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.spatialCacheHit, {
        ...(input.telemetryContext ?? {}),
        resolutionSource: 'address_geocode_cache',
      })
    )
    return {
      lat: cached.lat,
      lng: cached.lng,
      geocode_confidence: confidenceForPrecision(cached.coordinate_precision),
      coordinate_precision: cached.coordinate_precision,
      geocode_method: 'address_geocode_cache',
      resolutionSource: 'address_geocode_cache',
    }
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.spatialCacheMiss, {
      ...(input.telemetryContext ?? {}),
    })
  )

  const html = input.pageHtml?.trim()
  if (!html) return null

  const native = extractYstmNativeCoordinatesFromHtml(html)
  if (!native) return null

  const validation = validateNativeCoordinates({
    lat: native.lat,
    lng: native.lng,
    city,
    state,
    sourceUrl: input.sourceUrl,
  })
  if (!validation.ok) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.spatialNativeValidationFailed, {
        ...(input.telemetryContext ?? {}),
        failureReason: validation.reason,
        nativeSource: native.source,
      })
    )
    return null
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.spatialNativeResolved, {
      ...(input.telemetryContext ?? {}),
      nativeSource: native.source,
    })
  )

  return {
    lat: native.lat,
    lng: native.lng,
    geocode_confidence: 'high',
    coordinate_precision: 'provider_native',
    geocode_method: 'ystm_provider_native',
    resolutionSource: 'ystm_provider_native',
  }
}

export function shouldAttemptYstmNativeFromUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false
  try {
    const host = new URL(sourceUrl.trim()).hostname
    return /(?:^|\.)yardsaletreasuremap\.(?:com|net|org)$/i.test(host)
  } catch {
    return false
  }
}

export function pageHtmlEligibleForYstmNative(
  sourceUrl: string | null | undefined,
  pageHtml: string | null | undefined
): boolean {
  if (!pageHtml?.trim()) return false
  if (isYstmDetailListingUrl(sourceUrl)) return true
  return shouldAttemptYstmNativeFromUrl(sourceUrl)
}
