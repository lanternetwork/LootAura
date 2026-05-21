import { YSTM_CATALOG_REPAIRABLE_STATUSES } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairConfig'
import type { YstmCatalogRepairAggregate } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairStore'
import { isCatalogRepairCandidateRow } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairCandidates'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type { YstmCatalogRepairAggregate }

export async function aggregateYstmCatalogRepair(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<YstmCatalogRepairAggregate> {
  const pageSize = 1000
  let from = 0
  let repairQueueTotal = 0
  let needsGeocode = 0
  let readyUnpublished = 0
  let publishFailed = 0
  let needsCheck = 0
  let repairedPublishedLast24h = 0
  let repairFailed = 0
  const publishedCutoffMs = nowMs - 24 * 60 * 60 * 1000

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('source_url, status, published_sale_id, catalog_repair_outcome, catalog_repair_attempted_at')
      .eq('source_platform', 'external_page_source')
      .eq('is_duplicate', false)
      .in('status', [...YSTM_CATALOG_REPAIRABLE_STATUSES])
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as Array<{
      source_url: string
      status: string
      published_sale_id: string | null
      catalog_repair_outcome: string | null
      catalog_repair_attempted_at: string | null
    }>
    for (const row of chunk) {
      if (!isCatalogRepairCandidateRow(row)) continue
      repairQueueTotal += 1
      if (row.status === 'needs_geocode') needsGeocode += 1
      if (row.status === 'ready') readyUnpublished += 1
      if (row.status === 'publish_failed') publishFailed += 1
      if (row.status === 'needs_check') needsCheck += 1

      if (row.catalog_repair_outcome === 'failed') {
        repairFailed += 1
      }
      if (row.catalog_repair_outcome === 'published' && row.catalog_repair_attempted_at) {
        const attemptedMs = Date.parse(row.catalog_repair_attempted_at)
        if (Number.isFinite(attemptedMs) && attemptedMs >= publishedCutoffMs) {
          repairedPublishedLast24h += 1
        }
      }
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return {
    repairQueueTotal,
    needsGeocode,
    readyUnpublished,
    publishFailed,
    needsCheck,
    repairedPublishedLast24h,
    repairFailed,
  }
}
