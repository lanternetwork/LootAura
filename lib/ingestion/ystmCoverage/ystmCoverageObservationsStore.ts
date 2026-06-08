import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { YstmCoverageInvalidReason } from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'

import type { YstmCoverageFootprintMatchMethod } from '@/lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint'

export type YstmCoverageObservationUpsert = {
  canonicalUrl: string
  state: string
  city: string
  configKey: string
  ystmValidActive: boolean
  ystmInvalidReason: YstmCoverageInvalidReason | null
  lootauraVisible: boolean
  listSeenAt: string
  detailCheckedAt: string | null
  sourceListingId?: string | null
  saleInstanceKey?: string | null
  matchedIngestedSaleId?: string | null
  matchedSaleId?: string | null
  matchMethod?: YstmCoverageFootprintMatchMethod | null
}

export async function upsertYstmCoverageObservations(
  admin: ReturnType<typeof getAdminDb>,
  rows: YstmCoverageObservationUpsert[]
): Promise<void> {
  if (rows.length === 0) return
  const now = new Date().toISOString()
  const payload = rows.map((r) => ({
    canonical_url: r.canonicalUrl,
    state: r.state,
    city: r.city,
    config_key: r.configKey,
    ystm_valid_active: r.ystmValidActive,
    ystm_invalid_reason: r.ystmInvalidReason,
    lootaura_visible: r.lootauraVisible,
    last_list_seen_at: r.listSeenAt,
    last_detail_checked_at: r.detailCheckedAt,
    source_listing_id: r.sourceListingId ?? null,
    sale_instance_key: r.saleInstanceKey ?? null,
    matched_ingested_sale_id: r.matchedIngestedSaleId ?? null,
    matched_sale_id: r.matchedSaleId ?? null,
    match_method: r.matchMethod ?? null,
    updated_at: now,
  }))

  const chunkSize = 200
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize)
    const { error } = await fromBase(admin, 'ystm_coverage_observations').upsert(slice, {
      onConflict: 'canonical_url',
    })
    if (error) {
      throw new Error(error.message)
    }
  }
}

export type YstmCoverageMissingIngestionOutcome =
  | 'skipped_visible'
  | 'skipped_existing'
  | 'published'
  | 'ingested'
  | 'failed'

export type YstmCoverageObservationAggregate = {
  validActiveYstmUrls: number
  publishedVisibleInAudit: number
  missingValidYstmUrls: number
  missingByState: Record<string, number>
  missingByMetro: Record<string, number>
  observationCount: number
}

export type YstmCoverageMissingIngestionAggregate = {
  missingQueueTotal: number
  missingIngestionAttempted: number
  missingIngestionPublished: number
  missingIngestionIngested: number
  missingIngestionFailed: number
  missingIngestionSkippedVisible: number
  missingIngestionSkippedExisting: number
  missingIngestionNeverAttempted: number
}

export function shouldInvalidateObservationForExpiredAfterDetail(
  outcome: YstmCoverageMissingIngestionOutcome,
  failureReason?: string | null
): boolean {
  return outcome === 'failed' && failureReason === 'expired_after_detail'
}

export function buildMissingIngestionObservationUpdate(
  patch: {
    outcome: YstmCoverageMissingIngestionOutcome
    failureReason?: string | null
    lootauraVisible?: boolean
  },
  nowIso: string = new Date().toISOString()
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    missing_ingestion_attempted_at: nowIso,
    missing_ingestion_outcome: patch.outcome,
    missing_ingestion_failure_reason: patch.failureReason ?? null,
    updated_at: nowIso,
  }
  if (patch.lootauraVisible === true) {
    update.lootaura_visible = true
  }
  if (shouldInvalidateObservationForExpiredAfterDetail(patch.outcome, patch.failureReason)) {
    update.ystm_valid_active = false
    update.ystm_invalid_reason = 'expired'
    update.false_exclusion_primary_bucket = null
    update.false_exclusion_secondary_tags = []
    update.false_exclusion_evidence = null
    update.false_exclusion_summary = null
    update.false_exclusion_traced_at = null
  }
  return update
}

export async function recordYstmCoverageMissingIngestionOutcome(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  patch: {
    outcome: YstmCoverageMissingIngestionOutcome
    failureReason?: string | null
    lootauraVisible?: boolean
  }
): Promise<void> {
  const { error } = await fromBase(admin, 'ystm_coverage_observations')
    .update(buildMissingIngestionObservationUpdate(patch))
    .eq('canonical_url', canonicalUrl)
  if (error) {
    throw new Error(error.message)
  }
}

export async function aggregateYstmCoverageMissingIngestion(
  admin: ReturnType<typeof getAdminDb>
): Promise<YstmCoverageMissingIngestionAggregate> {
  const pageSize = 1000
  let from = 0
  let missingQueueTotal = 0
  let missingIngestionAttempted = 0
  let missingIngestionPublished = 0
  let missingIngestionIngested = 0
  let missingIngestionFailed = 0
  let missingIngestionSkippedVisible = 0
  let missingIngestionSkippedExisting = 0
  let missingIngestionNeverAttempted = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('ystm_valid_active, lootaura_visible, missing_ingestion_outcome, missing_ingestion_attempted_at')
      .order('canonical_url', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as Array<{
      ystm_valid_active: boolean
      lootaura_visible: boolean
      missing_ingestion_outcome: string | null
      missing_ingestion_attempted_at: string | null
    }>
    for (const row of chunk) {
      if (!row.ystm_valid_active || row.lootaura_visible) continue
      missingQueueTotal += 1
      if (!row.missing_ingestion_attempted_at) {
        missingIngestionNeverAttempted += 1
        continue
      }
      missingIngestionAttempted += 1
      switch (row.missing_ingestion_outcome) {
        case 'published':
          missingIngestionPublished += 1
          break
        case 'ingested':
          missingIngestionIngested += 1
          break
        case 'failed':
          missingIngestionFailed += 1
          break
        case 'skipped_visible':
          missingIngestionSkippedVisible += 1
          break
        case 'skipped_existing':
          missingIngestionSkippedExisting += 1
          break
        default:
          break
      }
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return {
    missingQueueTotal,
    missingIngestionAttempted,
    missingIngestionPublished,
    missingIngestionIngested,
    missingIngestionFailed,
    missingIngestionSkippedVisible,
    missingIngestionSkippedExisting,
    missingIngestionNeverAttempted,
  }
}

export async function aggregateYstmCoverageObservations(
  admin: ReturnType<typeof getAdminDb>
): Promise<YstmCoverageObservationAggregate> {
  const pageSize = 1000
  let from = 0
  let validActiveYstmUrls = 0
  let publishedVisibleInAudit = 0
  let observationCount = 0
  const missingByState: Record<string, number> = {}
  const missingByMetro: Record<string, number> = {}

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('ystm_valid_active, lootaura_visible, state, city')
      .order('canonical_url', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as Array<{
      ystm_valid_active: boolean
      lootaura_visible: boolean
      state: string | null
      city: string | null
    }>
    for (const row of chunk) {
      observationCount += 1
      if (!row.ystm_valid_active) continue
      validActiveYstmUrls += 1
      if (row.lootaura_visible) {
        publishedVisibleInAudit += 1
        continue
      }
      const st = (row.state ?? 'unknown').trim() || 'unknown'
      missingByState[st] = (missingByState[st] ?? 0) + 1
      const metro = `${(row.city ?? 'unknown').trim() || 'unknown'}, ${st}`
      missingByMetro[metro] = (missingByMetro[metro] ?? 0) + 1
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return {
    validActiveYstmUrls,
    publishedVisibleInAudit,
    missingValidYstmUrls: validActiveYstmUrls - publishedVisibleInAudit,
    missingByState,
    missingByMetro,
    observationCount,
  }
}
