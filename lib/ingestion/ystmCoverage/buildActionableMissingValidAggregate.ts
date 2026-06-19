import { classifyMissingValidReconciliation } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliation'
import {
  emptyMissingValidReconciliationClassCounts,
  isActionableReconciliationClass,
  type ActionableMissingValidAggregate,
} from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliationTypes'
import type { FalseExclusionUrlTrace } from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { isLinkedSaleVisibilityFiltered, type LinkedSaleVisibilitySnapshot } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'
import { loadWouldPublishShadowCanonicalUrls } from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedCandidates'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

type MissingObservationRow = {
  canonical_url: string
  missing_ingestion_outcome: string | null
  missing_ingestion_failure_reason: string | null
  missing_ingestion_replay_count?: number | null
}

type IngestedRow = {
  source_url: string
  address_status: string | null
  status: string | null
  published_sale_id: string | null
  is_duplicate: boolean
  failure_reasons: unknown
}

async function loadIngestedByUrls(
  admin: ReturnType<typeof getAdminDb>,
  urls: string[]
): Promise<Map<string, IngestedRow>> {
  const map = new Map<string, IngestedRow>()
  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const slice = urls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('source_url, address_status, status, published_sale_id, is_duplicate, failure_reasons')
      .in('source_url', slice)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const r = row as IngestedRow
      map.set(r.source_url, r)
    }
  }
  return map
}

async function loadLinkedSalesById(
  admin: ReturnType<typeof getAdminDb>,
  saleIds: string[]
): Promise<Map<string, LinkedSaleVisibilitySnapshot & { id: string }>> {
  const map = new Map<string, LinkedSaleVisibilitySnapshot & { id: string }>()
  const chunkSize = 100
  for (let i = 0; i < saleIds.length; i += chunkSize) {
    const slice = saleIds.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'sales')
      .select('id, status, archived_at, ends_at, moderation_status')
      .in('id', slice)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const r = row as LinkedSaleVisibilitySnapshot & { id: string }
      map.set(r.id, r)
    }
  }
  return map
}

export function buildActionableMissingValidAggregateFromTraces(params: {
  traces: FalseExclusionUrlTrace[]
  missingRows: MissingObservationRow[]
  ingestedByUrl: Map<string, IngestedRow>
  linkedSalesById: Map<string, LinkedSaleVisibilitySnapshot & { id: string }>
  wouldPublishUrls: Set<string>
  visibleCanonicalUrls: Set<string>
  nowMs?: number
}): ActionableMissingValidAggregate {
  const replayByUrl = new Map(
    params.missingRows.map((row) => [
      row.canonical_url,
      row.missing_ingestion_replay_count ?? 0,
    ])
  )
  const byClass = emptyMissingValidReconciliationClassCounts()

  for (const trace of params.traces) {
    const ingested = params.ingestedByUrl.get(trace.canonicalUrl) ?? null
    const linkedSale =
      ingested?.published_sale_id != null
        ? params.linkedSalesById.get(ingested.published_sale_id) ?? null
        : null
    const reconciliationClass = classifyMissingValidReconciliation({
      primaryBucket: trace.primaryBucket,
      secondaryTags: trace.secondaryTags,
      ingested: ingested
        ? {
            address_status: ingested.address_status,
            status: ingested.status,
            published_sale_id: ingested.published_sale_id,
            is_duplicate: ingested.is_duplicate,
            failure_reasons: ingested.failure_reasons,
          }
        : null,
      observation: {
        missing_ingestion_outcome: trace.evidence.missingIngestionOutcome,
        missing_ingestion_failure_reason: trace.evidence.missingIngestionFailureReason,
        missing_ingestion_replay_count: replayByUrl.get(trace.canonicalUrl) ?? 0,
      },
      linkedSale,
      wouldPublishShadow: params.wouldPublishUrls.has(trace.canonicalUrl),
      visibleInPublishedIndex: params.visibleCanonicalUrls.has(
        canonicalSourceUrl(trace.canonicalUrl)
      ),
      nowMs: params.nowMs,
    })
    byClass[reconciliationClass] += 1
  }

  const rawMissingValidYstmUrls = params.traces.length
  let actionableCount = 0
  for (const [cls, count] of Object.entries(byClass) as Array<
    [keyof typeof byClass, number]
  >) {
    if (isActionableReconciliationClass(cls)) actionableCount += count
  }

  return {
    rawMissingValidYstmUrls,
    effectiveMissingValidYstmUrls: actionableCount,
    actionableMissingValidYstmUrls: actionableCount,
    byReconciliationClass: byClass,
    terminalDispositionCount: byClass.TRUE_TERMINAL,
    visibilityFilterZombieCount: byClass.VISIBILITY_FILTER,
    expiredInventoryCount: byClass.EXPIRED_INVENTORY,
    staleObservationCount: byClass.STALE_OBSERVATION,
    recoverableCount: byClass.RECOVERABLE,
    missingIngestFetchFailedRetryableCount: byClass.MISSING_INGEST_FETCH_FAILED_RETRYABLE,
    duplicateSuppressedCount: byClass.DUPLICATE_SUPPRESSED,
    unknownActionableCount: byClass.UNKNOWN_ACTIONABLE,
    unknownNonActionableCount: byClass.UNKNOWN_NON_ACTIONABLE,
  }
}

export async function buildActionableMissingValidAggregate(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    traces: FalseExclusionUrlTrace[]
    missingRows: MissingObservationRow[]
    now?: Date
  }
): Promise<ActionableMissingValidAggregate> {
  const now = params.now ?? new Date()
  const urls = params.missingRows.map((r) => r.canonical_url)
  const [ingestedByUrl, wouldPublishUrls, publishedIndex] = await Promise.all([
    loadIngestedByUrls(admin, urls),
    loadWouldPublishShadowCanonicalUrls(admin),
    loadLootAuraPublishedYstmIndex(admin, now),
  ])

  const saleIds = [
    ...new Set(
      [...ingestedByUrl.values()]
        .map((r) => r.published_sale_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const linkedSalesById = await loadLinkedSalesById(admin, saleIds)

  return buildActionableMissingValidAggregateFromTraces({
    traces: params.traces,
    missingRows: params.missingRows,
    ingestedByUrl,
    linkedSalesById,
    wouldPublishUrls,
    visibleCanonicalUrls: publishedIndex.visibleCanonicalUrls,
    nowMs: now.getTime(),
  })
}

export { isLinkedSaleVisibilityFiltered }
