import { extractYstmDetailMediaStrFromHtml } from '@/lib/ingestion/images/extractYstmDetailMediaStr'
import { mergeIngestedSaleImageFields } from '@/lib/ingestion/images/mergeIngestedSaleImageFields'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const INGESTED_IMAGE_ENRICHMENT_DETAILS_SCHEMA_VERSION = 1 as const

export type ImageEnrichmentApplyResult = {
  skipped: boolean
  skipReason?: 'not_ystm_detail' | 'no_media_str' | 'no_valid_urls' | 'unchanged'
  mediaStrFound: boolean
  validImageCount: number
  rejectedCount: number
  updated: boolean
  urlFingerprints: string[]
}

function mergeImageEnrichmentDetails(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const prior =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  prior.image_enrichment = {
    schema_version: INGESTED_IMAGE_ENRICHMENT_DETAILS_SCHEMA_VERSION,
    recorded_at: new Date().toISOString(),
    ...patch,
  }
  return prior
}

/**
 * Parse detail HTML for mediaStr and persist image fields when merge produces updates.
 * Never changes ingest status or address lifecycle fields.
 */
export async function applyDetailPageImageEnrichment(input: {
  rowId: string
  sourceUrl: string
  html: string
  existingImageSourceUrl?: string | null
  existingRawPayload?: unknown
  existingFailureDetails?: unknown
  attemptCount?: number
  telemetryContext?: Record<string, unknown>
}): Promise<ImageEnrichmentApplyResult> {
  if (!isYstmDetailListingUrl(input.sourceUrl)) {
    return {
      skipped: true,
      skipReason: 'not_ystm_detail',
      mediaStrFound: false,
      validImageCount: 0,
      rejectedCount: 0,
      updated: false,
      urlFingerprints: [],
    }
  }

  const extracted = extractYstmDetailMediaStrFromHtml(input.html, input.sourceUrl)
  if (!extracted.mediaStrFound) {
    return {
      skipped: true,
      skipReason: 'no_media_str',
      mediaStrFound: false,
      validImageCount: 0,
      rejectedCount: extracted.rejectedCount,
      updated: false,
      urlFingerprints: [],
    }
  }

  if (extracted.imageUrls.length === 0) {
    return {
      skipped: true,
      skipReason: 'no_valid_urls',
      mediaStrFound: true,
      validImageCount: 0,
      rejectedCount: extracted.rejectedCount,
      updated: false,
      urlFingerprints: [],
    }
  }

  const merged = mergeIngestedSaleImageFields({
    existingImageSourceUrl: input.existingImageSourceUrl,
    existingRawPayload: input.existingRawPayload,
    newUrls: extracted.imageUrls,
  })

  if (!merged.updated) {
    return {
      skipped: true,
      skipReason: 'unchanged',
      mediaStrFound: true,
      validImageCount: merged.mergedCount,
      rejectedCount: extracted.rejectedCount,
      updated: false,
      urlFingerprints: extracted.urlFingerprints,
    }
  }

  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({
      image_source_url: merged.imageSourceUrl,
      raw_payload: merged.rawPayload,
      failure_details: mergeImageEnrichmentDetails(input.existingFailureDetails, {
        validImageCount: merged.mergedCount,
        rejectedCount: extracted.rejectedCount,
        mediaStrFound: true,
        urlFingerprints: extracted.urlFingerprints,
        attemptCount: input.attemptCount,
      }),
    })
    .eq('id', input.rowId)
    .select('id')
    .maybeSingle()

  if (error || !data?.id) {
    logger.warn('Image enrichment row update failed', {
      component: 'ingestion/images/applyDetailPageImageEnrichment',
      operation: 'persist_row',
      rowId: input.rowId,
      message: error?.message ?? 'no_row_updated',
    })
    return {
      skipped: true,
      skipReason: 'unchanged',
      mediaStrFound: true,
      validImageCount: merged.mergedCount,
      rejectedCount: extracted.rejectedCount,
      updated: false,
      urlFingerprints: extracted.urlFingerprints,
    }
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.imageEnrichmentRow, {
      ...(input.telemetryContext ?? {}),
      outcome: 'updated',
      validImageCount: merged.mergedCount,
      rejectedCount: extracted.rejectedCount,
      mediaStrFound: true,
      urlFingerprints: extracted.urlFingerprints,
      attemptCount: input.attemptCount,
    })
  )

  logger.info('Image enrichment row updated', {
    component: 'ingestion/images/applyDetailPageImageEnrichment',
    operation: 'row_updated',
    rowId: input.rowId,
    validImageCount: merged.mergedCount,
    rejectedCount: extracted.rejectedCount,
    mediaStrFound: true,
    preservedExisting: merged.preservedExisting,
  })

  return {
    skipped: false,
    mediaStrFound: true,
    validImageCount: merged.mergedCount,
    rejectedCount: extracted.rejectedCount,
    updated: true,
    urlFingerprints: extracted.urlFingerprints,
  }
}
