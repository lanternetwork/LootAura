import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  classifySaleInstance,
  shouldSupersedePublishedSaleForDecision,
} from '@/lib/ingestion/identity/classifySaleInstance'

export const YSTM_URL_REUSE_SUPERSESSION_REASON = 'url_reuse_new_event' as const

export type PriorIngestedSaleForUrlReuse = {
  id: string
  sale_instance_key: string | null
  published_sale_id: string | null
  date_start: string | null
  date_end: string | null
  status: string
  failure_reasons: unknown
  normalized_address: string | null
}

export type YstmUrlReuseSupersessionPatch = {
  superseded_sale_id: string
  superseded_at: string
  superseded_reason: string
  published_sale_id: null
}

/**
 * When detail-first refresh detects a new sale instance at the same URL, end prior map visibility
 * and clear the ingested publish link so a new sale can publish.
 */
export function planYstmUrlReuseSupersessionOnDetailRefresh(input: {
  prior: PriorIngestedSaleForUrlReuse
  sourcePlatform: string
  sourceUrl: string
  state?: string | null
  city?: string | null
  nextSaleInstanceKey: string | null
  nextSourceContentHash?: string | null
  listingStartDate: string | null
  listingEndDate: string | null
  listingAddressRaw: string | null
  seenAtIso?: string
}): YstmUrlReuseSupersessionPatch | null {
  const seenAt = input.seenAtIso ?? new Date().toISOString()
  const priorPublished = input.prior.published_sale_id?.trim() || null
  if (!priorPublished) return null

  const classification = classifySaleInstance({
    sourcePlatform: input.sourcePlatform,
    sourceUrl: input.sourceUrl,
    state: input.state ?? null,
    city: input.city ?? null,
    normalizedAddress: input.prior.normalized_address,
    dateStart: input.listingStartDate,
    dateEnd: input.listingEndDate,
    identity: input.nextSaleInstanceKey
      ? {
          source_listing_id: null,
          sale_instance_key: input.nextSaleInstanceKey,
          sale_instance_fingerprint: null,
          canonical_sale_instance_key: null,
          source_payload_hash: null,
          source_content_hash: input.nextSourceContentHash ?? null,
          source_schedule_hash: null,
          source_location_hash: null,
          source_url_first_seen_at: seenAt,
          source_url_last_seen_at: seenAt,
        }
      : null,
    existingRowsBySourceUrl: [
      {
        id: input.prior.id,
        sale_instance_key: input.prior.sale_instance_key,
        source_content_hash: null,
        date_start: input.prior.date_start,
        date_end: input.prior.date_end,
        normalized_address: input.prior.normalized_address,
        status: input.prior.status,
        failure_reasons: input.prior.failure_reasons,
      },
    ],
    existingRowsBySaleInstanceKey: [],
    existingRowsByAddressDate: [],
    seenAtIso: seenAt,
  })

  if (!shouldSupersedePublishedSaleForDecision(classification.decision)) {
    return null
  }

  return {
    superseded_sale_id: priorPublished,
    superseded_at: seenAt,
    superseded_reason: YSTM_URL_REUSE_SUPERSESSION_REASON,
    published_sale_id: null,
  }
}

/**
 * Hide a superseded published sale from public map reads (ends_at in the past).
 */
export async function supersedePublishedSaleForUrlReuse(
  admin: ReturnType<typeof getAdminDb>,
  publishedSaleId: string,
  seenAtIso?: string
): Promise<boolean> {
  const saleId = publishedSaleId.trim()
  if (!saleId) return false

  const endsAt = seenAtIso ?? new Date().toISOString()
  const { data, error } = await fromBase(admin, 'sales')
    .update({ ends_at: endsAt })
    .eq('id', saleId)
    .eq('status', 'published')
    .select('id')
    .maybeSingle()

  if (error || !data?.id) {
    logger.warn('supersedePublishedSaleForUrlReuse failed', {
      component: 'ingestion/identity/ystmUrlReuseSupersession',
      publishedSaleId: saleId,
      message: error?.message ?? 'no row updated',
    })
    return false
  }

  return true
}
