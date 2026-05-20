import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmExistingUrlRefreshAggregate = {
  externalIngestedTotal: number
  ystmDetailIngestedTotal: number
  syncedLast24h: number
  neverSynced: number
  staleOver12h: number
}

export async function aggregateYstmExistingUrlRefresh(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<YstmExistingUrlRefreshAggregate> {
  const pageSize = 1000
  let from = 0
  let externalIngestedTotal = 0
  let ystmDetailIngestedTotal = 0
  let syncedLast24h = 0
  let neverSynced = 0
  let staleOver12h = 0
  const staleCutoffMs = nowMs - 12 * 60 * 60 * 1000
  const syncedCutoffMs = nowMs - 24 * 60 * 60 * 1000

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('source_url, last_source_sync_at, source_sync_status')
      .eq('source_platform', 'external_page_source')
      .eq('is_duplicate', false)
      .neq('status', 'expired')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as Array<{
      source_url: string
      last_source_sync_at: string | null
      source_sync_status: string | null
    }>
    for (const row of chunk) {
      externalIngestedTotal += 1
      if (!isYstmDetailListingUrl(row.source_url)) continue
      ystmDetailIngestedTotal += 1
      if (!row.last_source_sync_at) {
        neverSynced += 1
        continue
      }
      const syncedMs = Date.parse(row.last_source_sync_at)
      if (!Number.isFinite(syncedMs)) {
        neverSynced += 1
        continue
      }
      if (syncedMs >= syncedCutoffMs && row.source_sync_status === 'synced') {
        syncedLast24h += 1
      }
      if (syncedMs < staleCutoffMs) {
        staleOver12h += 1
      }
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return {
    externalIngestedTotal,
    ystmDetailIngestedTotal,
    syncedLast24h,
    neverSynced,
    staleOver12h,
  }
}

export async function markCoverageObservationVisibleForSourceUrl(
  admin: ReturnType<typeof getAdminDb>,
  sourceUrl: string
): Promise<void> {
  const canonical = canonicalSourceUrl(sourceUrl)
  const { error } = await fromBase(admin, 'ystm_coverage_observations')
    .update({ lootaura_visible: true, updated_at: new Date().toISOString() })
    .eq('canonical_url', canonical)
  if (error) {
    throw new Error(error.message)
  }
}
