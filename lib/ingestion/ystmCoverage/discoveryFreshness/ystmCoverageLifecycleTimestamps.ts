import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'

export async function markYstmCoverageObservationFirstIngested(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  atIso: string = new Date().toISOString()
): Promise<void> {
  const url = canonicalSourceUrl(canonicalUrl)
  if (!url) return

  const { error } = await fromBase(admin, 'ystm_coverage_observations')
    .update({
      first_ingested_at: atIso,
      updated_at: atIso,
    })
    .eq('canonical_url', url)
    .is('first_ingested_at', null)

  if (error) {
    throw new Error(error.message)
  }
}

export async function markYstmCoverageObservationFirstPublished(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  atIso: string = new Date().toISOString()
): Promise<void> {
  const url = canonicalSourceUrl(canonicalUrl)
  if (!url) return

  const patch: Record<string, unknown> = {
    first_published_at: atIso,
    lootaura_visible: true,
    updated_at: atIso,
  }

  const { data: updated, error } = await fromBase(admin, 'ystm_coverage_observations')
    .update(patch)
    .eq('canonical_url', url)
    .is('first_published_at', null)
    .select('canonical_url')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!updated) {
    await upsertYstmCoverageObservationFromPublishHook(admin, {
      sourceUrl: url,
      publishedAt: atIso,
      saleId: null,
      ingestedSaleId: null,
    })
  }
}

export async function markYstmCoverageObservationFirstPublishedBySourceUrl(
  admin: ReturnType<typeof getAdminDb>,
  sourceUrl: string,
  atIso: string = new Date().toISOString()
): Promise<void> {
  const canonical = canonicalSourceUrl(sourceUrl)
  if (!canonical) return
  await markYstmCoverageObservationFirstPublished(admin, canonical, atIso)
}

export type PublishHookObservationInput = {
  sourceUrl: string
  publishedAt: string
  saleId: string | null
  ingestedSaleId: string | null
  city?: string | null
  state?: string | null
  configKey?: string | null
}

/**
 * Insert or patch observation when publish succeeds but no row existed (telemetry repair).
 */
export async function upsertYstmCoverageObservationFromPublishHook(
  admin: ReturnType<typeof getAdminDb>,
  input: PublishHookObservationInput
): Promise<void> {
  const canonical = canonicalSourceUrl(input.sourceUrl)
  if (!canonical) return

  let phase4Visible = false
  if (input.saleId) {
    let saleQuery = fromBase(admin, 'sales').select('id').eq('id', input.saleId)
    saleQuery = applyPhase4PublicPublishedSaleReadFilters(saleQuery)
    const { data: saleRow } = await saleQuery.maybeSingle()
    phase4Visible = Boolean(saleRow?.id)
  }

  const now = input.publishedAt
  const { data: existing } = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url, first_list_seen_at, first_ingested_at, first_published_at')
    .eq('canonical_url', canonical)
    .maybeSingle()

  if (existing) {
    const patch: Record<string, unknown> = {
      updated_at: now,
      ystm_valid_active: true,
      lootaura_visible: phase4Visible,
      matched_sale_id: input.saleId,
      matched_ingested_sale_id: input.ingestedSaleId,
    }
    if (!existing.first_ingested_at) patch.first_ingested_at = now
    if (!existing.first_published_at && phase4Visible) patch.first_published_at = now
    await fromBase(admin, 'ystm_coverage_observations').update(patch).eq('canonical_url', canonical)
    return
  }

  await fromBase(admin, 'ystm_coverage_observations').upsert(
    {
      canonical_url: canonical,
      state: input.state?.trim() || 'XX',
      city: input.city?.trim() || 'Unknown',
      config_key: input.configKey ?? null,
      ystm_valid_active: true,
      ystm_invalid_reason: null,
      lootaura_visible: phase4Visible,
      last_list_seen_at: now,
      first_list_seen_at: now,
      first_observed_at: now,
      first_ingested_at: now,
      first_published_at: phase4Visible ? now : null,
      appearance_source: 'publish_hook',
      matched_sale_id: input.saleId,
      matched_ingested_sale_id: input.ingestedSaleId,
      updated_at: now,
    },
    { onConflict: 'canonical_url' }
  )
}
