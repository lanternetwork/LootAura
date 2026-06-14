import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import {
  YSTM_CATALOG_REPAIRABLE_STATUSES,
  type YstmCatalogRepairBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairConfig'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmCatalogRepairCandidate = {
  ingestedSaleId: string
  sourceUrl: string
  city: string | null
  state: string | null
  status: string
  addressStatus: string | null
  publishedSaleId: string | null
  catalogRepairOutcome: string | null
  catalogRepairAttemptedAt: string | null
}

export type CatalogRepairCandidatePage = {
  candidates: YstmCatalogRepairCandidate[]
  queueOffset: number
  queueTotal: number
  nextQueueOffset: number
}

type IngestedRow = {
  id: string
  source_url: string
  city: string | null
  state: string | null
  status: string
  address_status: string | null
  published_sale_id: string | null
  catalog_repair_outcome: string | null
  catalog_repair_attempted_at: string | null
}

export function isEligibleForCatalogRepairRetry(
  row: Pick<YstmCatalogRepairCandidate, 'catalogRepairOutcome' | 'catalogRepairAttemptedAt'>,
  nowMs: number,
  failedRetryHours: number
): boolean {
  if (!row.catalogRepairOutcome) return true
  if (row.catalogRepairOutcome !== 'failed') return false
  if (!row.catalogRepairAttemptedAt) return true
  const attemptedMs = Date.parse(row.catalogRepairAttemptedAt)
  if (!Number.isFinite(attemptedMs)) return true
  return nowMs - attemptedMs >= failedRetryHours * 60 * 60 * 1000
}

/** Lower tier = higher priority (publish failures before address-gated unlock retries). */
const CATALOG_REPAIR_STATUS_PRIORITY: Record<string, number> = {
  publish_failed: 0,
  address_gated_needs_check: 1,
  needs_geocode: 2,
  ready: 3,
  needs_check: 4,
}

export function catalogRepairPriorityKey(
  row: Pick<YstmCatalogRepairCandidate, 'status' | 'addressStatus'>
): string {
  if (row.status === 'needs_check' && row.addressStatus === 'address_gated') {
    return 'address_gated_needs_check'
  }
  return row.status
}

export function compareCatalogRepairCandidatePriority(
  a: Pick<YstmCatalogRepairCandidate, 'status' | 'addressStatus' | 'ingestedSaleId'>,
  b: Pick<YstmCatalogRepairCandidate, 'status' | 'addressStatus' | 'ingestedSaleId'>
): number {
  const tierA = CATALOG_REPAIR_STATUS_PRIORITY[catalogRepairPriorityKey(a)] ?? 99
  const tierB = CATALOG_REPAIR_STATUS_PRIORITY[catalogRepairPriorityKey(b)] ?? 99
  if (tierA !== tierB) return tierA - tierB
  return a.ingestedSaleId.localeCompare(b.ingestedSaleId)
}

export function isCatalogRepairCandidateRow(
  row: Pick<IngestedRow, 'source_url' | 'status' | 'published_sale_id'>
): boolean {
  if (!isYstmDetailListingUrl(row.source_url)) return false
  if (!YSTM_CATALOG_REPAIRABLE_STATUSES.includes(row.status as (typeof YSTM_CATALOG_REPAIRABLE_STATUSES)[number])) {
    return false
  }
  if (row.status === 'published') return false
  if (row.published_sale_id && row.status !== 'publish_failed') return false
  return true
}

async function countCatalogRepairQueueTotal(admin: ReturnType<typeof getAdminDb>): Promise<number> {
  let total = 0
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('id, source_url, status, published_sale_id')
      .eq('source_platform', 'external_page_source')
      .eq('is_duplicate', false)
      .in('status', [...YSTM_CATALOG_REPAIRABLE_STATUSES])
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as IngestedRow[]
    for (const row of chunk) {
      if (isCatalogRepairCandidateRow(row)) total += 1
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return total
}

export async function fetchCatalogRepairCandidatePage(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    queueOffset: number
    scanLimit: number
    budgets: Pick<YstmCatalogRepairBudgets, 'failedRetryHours'>
    nowMs?: number
  }
): Promise<CatalogRepairCandidatePage> {
  const nowMs = params.nowMs ?? Date.now()
  const queueTotal = await countCatalogRepairQueueTotal(admin)
  if (queueTotal === 0) {
    return { candidates: [], queueOffset: 0, queueTotal: 0, nextQueueOffset: 0 }
  }

  const candidates: YstmCatalogRepairCandidate[] = []
  let offset = params.queueOffset % queueTotal
  let examined = 0
  const pageSize = Math.min(params.scanLimit, 200)

  while (candidates.length < params.scanLimit && examined < params.scanLimit * 4) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, city, state, status, address_status, published_sale_id, catalog_repair_outcome, catalog_repair_attempted_at'
      )
      .eq('source_platform', 'external_page_source')
      .eq('is_duplicate', false)
      .in('status', [...YSTM_CATALOG_REPAIRABLE_STATUSES])
      .order('catalog_repair_attempted_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as IngestedRow[]
    if (chunk.length === 0) break

    for (const row of chunk) {
      examined += 1
      if (!isCatalogRepairCandidateRow(row)) continue
      const mapped: YstmCatalogRepairCandidate = {
        ingestedSaleId: row.id,
        sourceUrl: row.source_url,
        city: row.city,
        state: row.state,
        status: row.status,
        addressStatus: row.address_status,
        publishedSaleId: row.published_sale_id,
        catalogRepairOutcome: row.catalog_repair_outcome,
        catalogRepairAttemptedAt: row.catalog_repair_attempted_at,
      }
      if (!isEligibleForCatalogRepairRetry(mapped, nowMs, params.budgets.failedRetryHours)) {
        continue
      }
      candidates.push(mapped)
      if (candidates.length >= params.scanLimit) break
    }

    offset = (offset + chunk.length) % Math.max(queueTotal, 1)
    if (chunk.length < pageSize) break
  }

  const nextQueueOffset = examined === 0 ? params.queueOffset % queueTotal : offset

  candidates.sort(compareCatalogRepairCandidatePriority)

  return {
    candidates,
    queueOffset: params.queueOffset % queueTotal,
    queueTotal,
    nextQueueOffset,
  }
}
