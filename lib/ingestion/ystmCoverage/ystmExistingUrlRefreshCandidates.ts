import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { YstmExistingUrlRefreshBudgets } from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshConfig'

export type YstmExistingUrlRefreshCandidate = {
  ingestedSaleId: string
  sourceUrl: string
  city: string | null
  state: string | null
  publishedSaleId: string | null
  status: string
  lastSourceSyncAt: string | null
}

export type ExistingUrlRefreshCandidatePage = {
  candidates: YstmExistingUrlRefreshCandidate[]
  queueOffset: number
  queueTotal: number
  nextQueueOffset: number
}

type IngestedRow = {
  id: string
  source_url: string
  city: string | null
  state: string | null
  published_sale_id: string | null
  status: string
  last_source_sync_at: string | null
}

export function isEligibleForExistingUrlRefresh(
  row: Pick<YstmExistingUrlRefreshCandidate, 'lastSourceSyncAt' | 'sourceUrl'>,
  nowMs: number,
  staleSyncHours: number
): boolean {
  if (!isYstmDetailListingUrl(row.sourceUrl)) return false
  if (!row.lastSourceSyncAt) return true
  const syncedMs = Date.parse(row.lastSourceSyncAt)
  if (!Number.isFinite(syncedMs)) return true
  return nowMs - syncedMs >= staleSyncHours * 60 * 60 * 1000
}

async function countRefreshQueueTotal(admin: ReturnType<typeof getAdminDb>): Promise<number> {
  const { count, error } = await fromBase(admin, 'ingested_sales')
    .select('id', { count: 'exact', head: true })
    .eq('source_platform', 'external_page_source')
    .eq('is_duplicate', false)
    .neq('status', 'expired')
  if (error) {
    throw new Error(error.message)
  }
  return count ?? 0
}

/**
 * Loads a bounded page of external_page_source ingested rows for YSTM detail refresh.
 * Ordered by stale sync first (nulls first), then source_url for stable rotation.
 */
export async function fetchExistingUrlRefreshCandidatePage(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    queueOffset: number
    scanLimit: number
    budgets: Pick<YstmExistingUrlRefreshBudgets, 'staleSyncHours'>
    nowMs?: number
  }
): Promise<ExistingUrlRefreshCandidatePage> {
  const nowMs = params.nowMs ?? Date.now()
  const queueTotal = await countRefreshQueueTotal(admin)
  if (queueTotal === 0) {
    return { candidates: [], queueOffset: 0, queueTotal: 0, nextQueueOffset: 0 }
  }

  const offset = params.queueOffset % queueTotal
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, source_url, city, state, published_sale_id, status, last_source_sync_at')
    .eq('source_platform', 'external_page_source')
    .eq('is_duplicate', false)
    .neq('status', 'expired')
    .order('last_source_sync_at', { ascending: true, nullsFirst: true })
    .order('source_url', { ascending: true })
    .range(offset, offset + params.scanLimit - 1)
  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as IngestedRow[]
  const candidates: YstmExistingUrlRefreshCandidate[] = []
  for (const row of rows) {
    const mapped: YstmExistingUrlRefreshCandidate = {
      ingestedSaleId: row.id,
      sourceUrl: row.source_url,
      city: row.city,
      state: row.state,
      publishedSaleId: row.published_sale_id,
      status: row.status,
      lastSourceSyncAt: row.last_source_sync_at,
    }
    if (!isEligibleForExistingUrlRefresh(mapped, nowMs, params.budgets.staleSyncHours)) {
      continue
    }
    candidates.push(mapped)
  }

  const examined = rows.length
  const nextQueueOffset = examined === 0 ? offset : (offset + examined) % queueTotal

  return {
    candidates,
    queueOffset: offset,
    queueTotal,
    nextQueueOffset,
  }
}
