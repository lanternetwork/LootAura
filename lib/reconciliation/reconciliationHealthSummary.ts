import { fromBase } from '@/lib/supabase/clients'
import type { getAdminDb } from '@/lib/supabase/clients'

export interface ReconciliationHealthSummary {
  readonly candidateIngestRowsApprox: number
  readonly placeholderFlaggedCount: number
  readonly statusParseFailedCount: number
  readonly statusMissingSoftCount: number
  readonly changedLast24hCount: number
  readonly staleSyncApproxCount: number
}

type AdminClient = ReturnType<typeof getAdminDb>

async function countPublishedLinkedIngest(admin: AdminClient): Promise<number> {
  const { count } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('published_sale_id', 'is', null)
    .not('source_url', 'is', null)
    .eq('is_duplicate', false)
    .eq('status', 'published')
  return count ?? 0
}

/**
 * Aggregate-only diagnostics for admin dashboards (no row payloads).
 */
export async function getReconciliationHealthSummary(
  admin: AdminClient,
  nowMs: number
): Promise<ReconciliationHealthSummary> {
  const iso24hAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const isoStale = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  const { count: placeholderFlaggedCount } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('published_sale_id', 'is', null)
    .not('source_url', 'is', null)
    .eq('is_duplicate', false)
    .eq('status', 'published')
    .eq('source_placeholder_detected', true)

  const { count: statusParseFailedCount } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('published_sale_id', 'is', null)
    .not('source_url', 'is', null)
    .eq('is_duplicate', false)
    .eq('status', 'published')
    .eq('source_sync_status', 'parse_failed')

  const { count: statusMissingSoftCount } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('published_sale_id', 'is', null)
    .not('source_url', 'is', null)
    .eq('is_duplicate', false)
    .eq('status', 'published')
    .eq('source_sync_status', 'source_missing_soft')

  const { count: changedLast24hCount } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('published_sale_id', 'is', null)
    .not('source_url', 'is', null)
    .eq('is_duplicate', false)
    .eq('status', 'published')
    .gte('last_source_change_at', iso24hAgo)

  const { count: staleSyncApproxCount } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .not('published_sale_id', 'is', null)
    .not('source_url', 'is', null)
    .eq('is_duplicate', false)
    .eq('status', 'published')
    .or(`last_source_sync_at.is.null,last_source_sync_at.lt.${isoStale}`)

  const candidateIngestRowsApprox = await countPublishedLinkedIngest(admin)

  return {
    candidateIngestRowsApprox,
    placeholderFlaggedCount: placeholderFlaggedCount ?? 0,
    statusParseFailedCount: statusParseFailedCount ?? 0,
    statusMissingSoftCount: statusMissingSoftCount ?? 0,
    changedLast24hCount: changedLast24hCount ?? 0,
    staleSyncApproxCount: staleSyncApproxCount ?? 0,
  }
}
