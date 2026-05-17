import { extractYstmDetailMediaStrFromHtml } from '@/lib/ingestion/images/extractYstmDetailMediaStr'
import {
  mergeIngestedImageEnrichmentDetails,
  type IngestedImageEnrichmentDetails,
} from '@/lib/ingestion/images/ingestedImageEnrichmentDetails'
import { mergeIngestedSaleImageFields } from '@/lib/ingestion/images/mergeIngestedSaleImageFields'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export { INGESTED_IMAGE_ENRICHMENT_DETAILS_SCHEMA_VERSION } from '@/lib/ingestion/images/ingestedImageEnrichmentDetails'

export type ImageEnrichmentApplyResult = {
  skipped: boolean
  skipReason?: 'not_ystm_detail' | 'no_media_str' | 'no_valid_urls' | 'unchanged'
  mediaStrFound: boolean
  validImageCount: number
  rejectedCount: number
  updated: boolean
  urlFingerprints: string[]
}

async function persistImageEnrichmentAttempt(
  rowId: string,
  existingFailureDetails: unknown,
  patch: Omit<IngestedImageEnrichmentDetails, 'schema_version' | 'recorded_at'>
): Promise<void> {
  const admin = getAdminDb()
  await fromBase(admin, 'ingested_sales')
    .update({
      failure_details: mergeIngestedImageEnrichmentDetails(existingFailureDetails, patch),
    })
    .eq('id', rowId)
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
  detailAttemptSource?: 'address_enrichment' | 'image_enrichment'
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

  const attemptMeta = {
    detailHtmlParsed: true as const,
    detailAttemptSource: input.detailAttemptSource,
    attemptCount: input.attemptCount,
  }

  const extracted = extractYstmDetailMediaStrFromHtml(input.html, input.sourceUrl)
  if (!extracted.mediaStrFound) {
    await persistImageEnrichmentAttempt(input.rowId, input.existingFailureDetails, {
      ...attemptMeta,
      skipReason: 'no_media_str',
      mediaStrFound: false,
      validImageCount: 0,
      rejectedCount: extracted.rejectedCount,
    })
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
    await persistImageEnrichmentAttempt(input.rowId, input.existingFailureDetails, {
      ...attemptMeta,
      skipReason: 'no_valid_urls',
      mediaStrFound: true,
      validImageCount: 0,
      rejectedCount: extracted.rejectedCount,
      urlFingerprints: extracted.urlFingerprints,
    })
    return {
      skipped: true,
      skipReason: 'no_valid_urls',
      mediaStrFound: true,
      validImageCount: 0,
      rejectedCount: extracted.rejectedCount,
      updated: false,
      urlFingerprints: extracted.urlFingerprints,
    }
  }

  const merged = mergeIngestedSaleImageFields({
    existingImageSourceUrl: input.existingImageSourceUrl,
    existingRawPayload: input.existingRawPayload,
    newUrls: extracted.imageUrls,
  })

  if (!merged.updated) {
    await persistImageEnrichmentAttempt(input.rowId, input.existingFailureDetails, {
      ...attemptMeta,
      skipReason: 'unchanged',
      mediaStrFound: true,
      validImageCount: merged.mergedCount,
      rejectedCount: extracted.rejectedCount,
      urlFingerprints: extracted.urlFingerprints,
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

  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({
      image_source_url: merged.imageSourceUrl,
      raw_payload: merged.rawPayload,
      failure_details: mergeIngestedImageEnrichmentDetails(input.existingFailureDetails, {
        ...attemptMeta,
        skipReason: undefined,
        validImageCount: merged.mergedCount,
        rejectedCount: extracted.rejectedCount,
        mediaStrFound: true,
        urlFingerprints: extracted.urlFingerprints,
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
