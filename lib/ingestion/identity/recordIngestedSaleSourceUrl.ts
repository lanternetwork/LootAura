import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { extractYstmSourceListingId } from '@/lib/ingestion/identity/ystmSourceListingId'
import { logger } from '@/lib/log'
import { fromBase, type AdminDb } from '@/lib/supabase/clients'

export type RecordIngestedSaleSourceUrlInput = {
  ingestedSaleId: string
  sourcePlatform: string
  sourceUrl: string
  sourceListingId?: string | null
  payloadHash?: string | null
  seenAtIso?: string
}

/**
 * Persist or refresh a source URL alias row for an ingested sale (observability only).
 * Does not change crawl skip / dedupe behavior.
 */
export async function recordIngestedSaleSourceUrl(
  admin: AdminDb,
  input: RecordIngestedSaleSourceUrlInput
): Promise<void> {
  const ingestedSaleId = input.ingestedSaleId?.trim()
  const sourceUrl = input.sourceUrl?.trim()
  const sourcePlatform = input.sourcePlatform?.trim()
  if (!ingestedSaleId || !sourceUrl || !sourcePlatform) return

  const seenAt = input.seenAtIso ?? new Date().toISOString()
  const canonical = canonicalSourceUrl(sourceUrl)
  const sourceListingId =
    input.sourceListingId?.trim() || extractYstmSourceListingId(sourceUrl) || null

  try {
    const { data: existing, error: selErr } = await fromBase(admin, 'ingested_sale_source_urls')
      .select('id')
      .eq('ingested_sale_id', ingestedSaleId)
      .eq('canonical_source_url', canonical)
      .maybeSingle()

    if (selErr) {
      throw new Error(selErr.message)
    }

    if (existing?.id) {
      const { error: updErr } = await fromBase(admin, 'ingested_sale_source_urls')
        .update({
          last_seen_at: seenAt,
          is_current: true,
          source_listing_id: sourceListingId,
          payload_hash: input.payloadHash ?? null,
          updated_at: seenAt,
        })
        .eq('id', String(existing.id))

      if (updErr) throw new Error(updErr.message)
      return
    }

    const { error: insErr } = await fromBase(admin, 'ingested_sale_source_urls').insert({
      ingested_sale_id: ingestedSaleId,
      source_platform: sourcePlatform,
      source_url: sourceUrl,
      canonical_source_url: canonical,
      source_listing_id: sourceListingId,
      first_seen_at: seenAt,
      last_seen_at: seenAt,
      is_current: true,
      payload_hash: input.payloadHash ?? null,
      created_at: seenAt,
      updated_at: seenAt,
    })

    if (insErr) throw new Error(insErr.message)
  } catch (e) {
    logger.warn('recordIngestedSaleSourceUrl failed', {
      component: 'ingestion/identity/recordIngestedSaleSourceUrl',
      ingestedSaleId,
      sourcePlatform,
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
