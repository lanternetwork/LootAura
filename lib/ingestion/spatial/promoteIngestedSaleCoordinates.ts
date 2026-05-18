import type { CoordinatePrecision, GeocodeConfidence, GeocodeMethod } from '@/lib/geocode/geocodePrecisionPolicy'
import { publishReadyIngestedSaleById, type PublishReadyByIdResult } from '@/lib/ingestion/publishWorker'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { removeGeocodeSubDocumentFromFailureDetails } from '@/lib/ingestion/geocodeWorker'

export type PromoteIngestedSaleCoordinatesMetadata = {
  geocode_confidence: GeocodeConfidence
  coordinate_precision: CoordinatePrecision
  geocode_method: GeocodeMethod
}

/**
 * Mark `needs_geocode` row ready with coordinates and trigger publish (same path as geocode worker success).
 */
export async function promoteIngestedSaleCoordinates(
  rowId: string,
  lat: number,
  lng: number,
  metadata: PromoteIngestedSaleCoordinatesMetadata,
  options?: { allowedPriorStatuses?: Array<'needs_geocode' | 'needs_check'> }
): Promise<{ kind: 'geocoded'; publish: PublishReadyByIdResult } | { kind: 'update_failed' }> {
  const admin = getAdminDb()
  const allowedPriorStatuses = options?.allowedPriorStatuses ?? ['needs_geocode']

  let priorQuery = fromBase(admin, 'ingested_sales')
    .select('failure_details, status')
    .eq('id', rowId)
  priorQuery =
    allowedPriorStatuses.length === 1 && allowedPriorStatuses[0] === 'needs_geocode'
      ? priorQuery.eq('status', 'needs_geocode')
      : priorQuery.in('status', allowedPriorStatuses)

  const { data: priorRow, error: priorErr } = await priorQuery.maybeSingle()

  const clearedFailureDetails =
    !priorErr && priorRow != null
      ? removeGeocodeSubDocumentFromFailureDetails((priorRow as { failure_details?: unknown }).failure_details)
      : undefined

  const updatePayload: Record<string, unknown> = {
    lat,
    lng,
    status: 'ready',
    geocode_confidence: metadata.geocode_confidence,
    coordinate_precision: metadata.coordinate_precision,
    geocode_method: metadata.geocode_method,
  }
  if (clearedFailureDetails !== undefined) {
    updatePayload.failure_details = clearedFailureDetails
  }

  let updateQuery = fromBase(admin, 'ingested_sales').update(updatePayload).eq('id', rowId)
  updateQuery =
    allowedPriorStatuses.length === 1 && allowedPriorStatuses[0] === 'needs_geocode'
      ? updateQuery.eq('status', 'needs_geocode')
      : updateQuery.in('status', allowedPriorStatuses)

  const { data: updated, error: updateError } = await updateQuery.select('id').maybeSingle()

  if (updateError) {
    logger.error('Failed to promote ingested row with coordinates', new Error(updateError.message), {
      component: 'ingestion/spatial/promoteIngestedSaleCoordinates',
      operation: 'mark_ready',
      rowId,
    })
    return { kind: 'update_failed' }
  }

  const publishResult = await publishReadyIngestedSaleById(rowId)

  if (!updated) {
    logger.info('Coordinate promote skipped (concurrent transition); publish attempted', {
      component: 'ingestion/spatial/promoteIngestedSaleCoordinates',
      operation: 'promote',
      rowId,
    })
  }

  return { kind: 'geocoded', publish: publishResult }
}
