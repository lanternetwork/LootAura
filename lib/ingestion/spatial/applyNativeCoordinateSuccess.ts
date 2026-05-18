import type { SpatialCoordinateResolution } from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { upsertAddressGeocodeCache } from '@/lib/ingestion/spatial/addressGeocodeCache'
import {
  promoteIngestedSaleCoordinates,
  type PromoteIngestedSaleCoordinatesMetadata,
} from '@/lib/ingestion/spatial/promoteIngestedSaleCoordinates'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export type ApplyNativeCoordinateSuccessResult =
  | { kind: 'promoted'; published: boolean }
  | { kind: 'update_failed' }

/**
 * Persist cache, promote to ready, publish, and clear native remediation claim metadata.
 */
export async function applyNativeCoordinateSuccess(params: {
  rowId: string
  priorStatus: 'needs_geocode' | 'needs_check'
  spatial: SpatialCoordinateResolution
  addressRaw: string | null
  normalizedAddress: string | null
  city: string
  state: string
  telemetryContext?: Record<string, unknown>
}): Promise<ApplyNativeCoordinateSuccessResult> {
  await upsertAddressGeocodeCache({
    addressRaw: params.addressRaw,
    normalizedAddress: params.normalizedAddress,
    city: params.city,
    state: params.state,
    lat: params.spatial.lat,
    lng: params.spatial.lng,
    coordinate_precision: params.spatial.coordinate_precision,
    geocode_method: params.spatial.geocode_method,
  })

  const metadata: PromoteIngestedSaleCoordinatesMetadata = {
    geocode_confidence: params.spatial.geocode_confidence,
    coordinate_precision: params.spatial.coordinate_precision,
    geocode_method: params.spatial.geocode_method,
  }

  const promoted = await promoteIngestedSaleCoordinates(
    params.rowId,
    params.spatial.lat,
    params.spatial.lng,
    metadata,
    { allowedPriorStatuses: [params.priorStatus] }
  )

  if (promoted.kind === 'update_failed') {
    return { kind: 'update_failed' }
  }

  const admin = getAdminDb()
  await fromBase(admin, 'ingested_sales')
    .update({
      native_coord_failure_reason: null,
      native_coord_last_error: null,
      native_coord_next_attempt_at: null,
      native_coord_claimed_at: null,
      native_coord_claimed_by: null,
    })
    .eq('id', params.rowId)

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordPromoted, {
      ...(params.telemetryContext ?? {}),
      rowId: params.rowId,
      resolutionSource: params.spatial.resolutionSource,
      priorStatus: params.priorStatus,
    })
  )

  const publish = promoted.publish
  if (publish.ok === true && 'publishedSaleId' in publish) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordPublishSuccess, {
        ...(params.telemetryContext ?? {}),
        rowId: params.rowId,
      })
    )
    return { kind: 'promoted', published: true }
  }

  if (publish.ok === false) {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.nativeCoordPublishFailed, {
        ...(params.telemetryContext ?? {}),
        rowId: params.rowId,
        publishError: publish.error,
      })
    )
  }
  return { kind: 'promoted', published: false }
}
