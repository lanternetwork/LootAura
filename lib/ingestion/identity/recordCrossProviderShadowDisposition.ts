import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import type { CrossProviderIngestDispositionResult } from '@/lib/ingestion/identity/crossProviderDispositionTypes'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type RecordCrossProviderShadowInput = {
  sourceUrl: string
  sourcePlatform: string
  incomingCanonicalKey: string | null
  currentWouldSoftSkip: boolean
  context: string
  disposition: CrossProviderIngestDispositionResult
}

export async function recordCrossProviderShadowDisposition(
  admin: ReturnType<typeof getAdminDb>,
  input: RecordCrossProviderShadowInput
): Promise<void> {
  const d = input.disposition
  const row = {
    incoming_source_url: input.sourceUrl,
    incoming_source_platform: input.sourcePlatform,
    incoming_canonical_sale_instance_key: input.incomingCanonicalKey,
    matched_ingested_sale_id: d.matchedIngestedSaleId,
    matched_source_platform: d.matchedPlatform,
    matched_canonical_sale_instance_key: d.matchedCanonicalKey,
    matched_published_sale_id: d.matchedPublishedSaleId,
    disposition: d.disposition,
    confidence: d.confidence,
    match_method: d.matchMethod === 'none' ? null : d.matchMethod,
    match_reasons: d.matchReasons,
    is_false_negative: d.isFalseNegative,
    current_would_soft_skip: input.currentWouldSoftSkip,
    context: input.context,
  }

  const { error } = await fromBase(admin, 'cross_provider_sale_instance_shadow').insert(row)
  if (error) {
    logger.warn('cross_provider_shadow: persist failed', {
      component: 'ingestion/cross_provider_shadow',
      message: error.message,
      sourceUrl: input.sourceUrl,
    })
    return
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.crossProviderShadowDisposition, {
      sourcePlatform: input.sourcePlatform,
      sourceUrl: input.sourceUrl,
      disposition: d.disposition,
      confidence: d.confidence,
      matchMethod: d.matchMethod,
      isFalseNegative: d.isFalseNegative,
      currentWouldSoftSkip: input.currentWouldSoftSkip,
      context: input.context,
      matchedIngestedSaleId: d.matchedIngestedSaleId,
      matchedPublishedSaleId: d.matchedPublishedSaleId,
    })
  )
}
