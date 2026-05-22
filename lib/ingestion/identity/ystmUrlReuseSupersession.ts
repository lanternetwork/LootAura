import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  classifyYstmUrlReuseFromListSeed,
  saleInstanceKeysMateriallyDiffer,
  type YstmUrlReuseListSeedContext,
} from '@/lib/ingestion/identity/classifyYstmUrlReuseEvent'

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
  nextSaleInstanceKey: string | null
  listingStartDate: string | null
  listingEndDate: string | null
  listingAddressRaw: string | null
  seenAtIso?: string
}): YstmUrlReuseSupersessionPatch | null {
  const seenAt = input.seenAtIso ?? new Date().toISOString()
  const priorPublished = input.prior.published_sale_id?.trim() || null
  if (!priorPublished) return null

  const keyDiffers = saleInstanceKeysMateriallyDiffer(
    input.prior.sale_instance_key,
    input.nextSaleInstanceKey
  )
  const listEvent = classifyYstmUrlReuseFromListSeed({
    listingStartDate: input.listingStartDate,
    listingEndDate: input.listingEndDate,
    listingAddressRaw: input.listingAddressRaw,
    existing: {
      status: input.prior.status,
      failure_reasons: input.prior.failure_reasons,
      date_start: input.prior.date_start,
      date_end: input.prior.date_end,
      normalized_address: input.prior.normalized_address,
    },
  } satisfies YstmUrlReuseListSeedContext)

  if (!keyDiffers && listEvent !== 'new_event_same_url') {
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
