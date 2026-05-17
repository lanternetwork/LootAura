import { z } from 'zod'
import { detectGatedListing, parseSeeSourceUnlockAtFromListingUrl } from '@/lib/ingestion/address/addressGated'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import {
  addressLifecycleFieldsForDb,
  resolveIngestAddressLifecycle,
} from '@/lib/ingestion/address/resolveIngestAddressLifecycle'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const RemediateGatedAddressBacklogSchema = z.object({
  batchSize: z.number().int().min(1).max(500).default(100),
})

export type RemediateGatedAddressBacklogInput = z.infer<typeof RemediateGatedAddressBacklogSchema>

export type RemediateGatedAddressBacklogSummary = {
  scanned: number
  remediated: number
  skipped: number
}

function rowHasMissingAddressGeocodeFailure(failureDetails: unknown): boolean {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) {
    return false
  }
  const o = failureDetails as Record<string, unknown>
  const geocode = o.geocode as Record<string, unknown> | undefined
  if (geocode?.noCoordsReason === 'empty_input') return true
  const dl = o.geocode_dead_letter as Record<string, unknown> | undefined
  const reasons = dl?.reasons
  if (Array.isArray(reasons) && reasons.includes('missing_address_input')) return true
  return false
}

function isAlbanyStyleEmptyResultsBacklog(failureDetails: unknown): boolean {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) {
    return false
  }
  const o = failureDetails as Record<string, unknown>
  const geocode = o.geocode as Record<string, unknown> | undefined
  const n = String(geocode?.noCoordsReason ?? '').trim()
  const p = String(geocode?.providerClassification ?? '').trim()
  return n === 'empty_results' || p === 'empty_results'
}

/**
 * Bounded one-time remediation: move gated null-address geocode failures into address lifecycle.
 * Does not replay Albany-style empty_results rows.
 */
export async function remediateGatedAddressBacklog(
  input: RemediateGatedAddressBacklogInput
): Promise<RemediateGatedAddressBacklogSummary> {
  const parsed = RemediateGatedAddressBacklogSchema.parse(input)
  const admin = getAdminDb()
  const summary: RemediateGatedAddressBacklogSummary = { scanned: 0, remediated: 0, skipped: 0 }

  const { data: rows, error } = await fromBase(admin, 'ingested_sales')
    .select(
      'id, source_url, source_platform, address_raw, status, failure_reasons, failure_details, raw_payload'
    )
    .eq('status', 'needs_check')
    .is('address_raw', null)
    .order('updated_at', { ascending: true })
    .limit(parsed.batchSize)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of rows ?? []) {
    summary.scanned += 1
    const id = String(row.id)
    const sourceUrl = row.source_url != null ? String(row.source_url) : ''
    const addressRaw = row.address_raw != null ? String(row.address_raw) : null

    if (isAddressGeocodeReady(addressRaw)) {
      summary.skipped += 1
      continue
    }

    if (isAlbanyStyleEmptyResultsBacklog(row.failure_details)) {
      summary.skipped += 1
      continue
    }

    const failureReasons = Array.isArray(row.failure_reasons)
      ? (row.failure_reasons as string[])
      : []
    const hasGeocodeFailed = failureReasons.includes('geocode_failed')
    const missingInput =
      rowHasMissingAddressGeocodeFailure(row.failure_details) ||
      (hasGeocodeFailed && !isAddressGeocodeReady(addressRaw))

    if (!missingInput) {
      summary.skipped += 1
      continue
    }

    const rawPayload = row.raw_payload
    const diag =
      rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? ((rawPayload as Record<string, unknown>).ingestionDiagnostics as Record<string, unknown> | undefined)
        : undefined

    const gated = detectGatedListing({
      sourceUrl,
      addressRaw,
      diagnostics: {
        slugWasPlaceholder: diag?.slugWasPlaceholder === true,
        chosenAddressSource:
          typeof diag?.chosenAddressSource === 'string' ? diag.chosenAddressSource : undefined,
      },
    })

    if (!gated.gated && !parseSeeSourceUnlockAtFromListingUrl(sourceUrl)) {
      summary.skipped += 1
      continue
    }

    const lifecycle = resolveIngestAddressLifecycle({
      sourceUrl,
      addressRaw: null,
      wouldBeNeedsGeocode: false,
      diagnostics: {
        slugWasPlaceholder: gated.slugWasPlaceholder,
        chosenAddressSource:
          typeof diag?.chosenAddressSource === 'string' ? diag.chosenAddressSource : 'none',
      },
    })

    const { error: upErr } = await fromBase(admin, 'ingested_sales')
      .update({
        status: 'needs_check',
        geocode_attempts: 0,
        last_geocode_attempt_at: null,
        failure_reasons: failureReasons.filter((r) => r !== 'geocode_failed'),
        ...addressLifecycleFieldsForDb(lifecycle),
        canonical_source_url: canonicalSourceUrl(sourceUrl),
      })
      .eq('id', id)

    if (upErr) {
      logger.warn('Gated address remediation update failed', {
        component: 'ingestion/address/remediateGatedAddressBacklog',
        operation: 'update_row',
        rowId: id,
        message: upErr.message,
      })
      summary.skipped += 1
      continue
    }

    summary.remediated += 1
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.addressRemediationBatch, {
      ...summary,
      batchSize: parsed.batchSize,
    })
  )

  return summary
}
