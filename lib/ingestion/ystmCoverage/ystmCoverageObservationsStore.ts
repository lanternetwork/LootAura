import {
  markYstmCoverageObservationFirstIngested,
  markYstmCoverageObservationFirstPublished,
} from '@/lib/ingestion/ystmCoverage/discoveryFreshness/ystmCoverageLifecycleTimestamps'
import {
  MISSING_INGEST_FETCH_FAILED_MAX_REPLAY_FAILURES,
  MISSING_INGEST_TERMINAL_FAILURE_REASON,
} from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedRecoveryConfig'
import type { YstmCoverageInvalidReason } from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

import type { YstmCoverageFootprintMatchMethod } from '@/lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint'

import type { MissingIngestionFailureDetails } from '@/lib/ingestion/ystmCoverage/listFastInsertFailureDiagnosticTypes'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

export type YstmDiscoveryPriority = 'hot' | 'warm' | 'cold'

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
  listMetadataSnapshot?: YstmListMetadataSale | null
  listMetadataHash?: string | null
  discoveryPriority?: YstmDiscoveryPriority | null
  appearanceSource?: string | null
  ystmListingPostedAt?: string | null
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
    list_metadata_snapshot: r.listMetadataSnapshot ?? null,
    list_metadata_hash: r.listMetadataHash ?? null,
    discovery_priority: r.discoveryPriority ?? null,
    appearance_source: r.appearanceSource ?? null,
    ystm_listing_posted_at: r.ystmListingPostedAt ?? null,
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
  | 'terminal'

export function buildFetchFailedReplayFailurePatch(
  currentReplayCount: number,
  nowIso: string = new Date().toISOString()
): {
  outcome: YstmCoverageMissingIngestionOutcome
  failureReason: string
  missingIngestionReplayCount: number
  missingIngestionLastRetryAt: string
} {
  const nextCount = currentReplayCount + 1
  if (nextCount >= MISSING_INGEST_FETCH_FAILED_MAX_REPLAY_FAILURES) {
    return {
      outcome: 'terminal',
      failureReason: MISSING_INGEST_TERMINAL_FAILURE_REASON,
      missingIngestionReplayCount: nextCount,
      missingIngestionLastRetryAt: nowIso,
    }
  }
  return {
    outcome: 'failed',
    failureReason: 'fetch_failed',
    missingIngestionReplayCount: nextCount,
    missingIngestionLastRetryAt: nowIso,
  }
}

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

export function shouldInvalidateObservationForExpiredMissingIngest(
  outcome: YstmCoverageMissingIngestionOutcome,
  failureReason?: string | null
): boolean {
  return (
    outcome === 'failed' &&
    (failureReason === 'expired' || failureReason === 'expired_after_detail')
  )
}

/** @deprecated Prefer {@link shouldInvalidateObservationForExpiredMissingIngest}. */
export function shouldInvalidateObservationForExpiredAfterDetail(
  outcome: YstmCoverageMissingIngestionOutcome,
  failureReason?: string | null
): boolean {
  return shouldInvalidateObservationForExpiredMissingIngest(outcome, failureReason)
}

export type PublishedNotVisibleDispositionInvalidReason = 'archived' | 'expired'

export function buildPublishedNotVisibleDispositionInvalidationFields(
  reason: PublishedNotVisibleDispositionInvalidReason
): Record<string, unknown> {
  return {
    ystm_valid_active: false,
    ystm_invalid_reason: reason,
    discovery_priority: 'cold',
    false_exclusion_primary_bucket: null,
    false_exclusion_secondary_tags: [],
    false_exclusion_evidence: null,
    false_exclusion_summary: null,
    false_exclusion_traced_at: null,
  }
}

export function buildArchivedObservationInvalidationFields(): Record<string, unknown> {
  return buildPublishedNotVisibleDispositionInvalidationFields('archived')
}

export function buildExpiredObservationInvalidationFields(): Record<string, unknown> {
  return buildPublishedNotVisibleDispositionInvalidationFields('expired')
}

export function buildTerminalDispositionObservationInvalidationFields(): Record<string, unknown> {
  return {
    ystm_valid_active: false,
    ystm_invalid_reason: 'address_terminal',
    discovery_priority: 'cold',
    false_exclusion_primary_bucket: null,
    false_exclusion_secondary_tags: [],
    false_exclusion_evidence: null,
    false_exclusion_summary: null,
    false_exclusion_traced_at: null,
  }
}

export function buildMissingIngestionObservationUpdate(
  patch: {
    outcome: YstmCoverageMissingIngestionOutcome
    failureReason?: string | null
    missingIngestionFailureDetails?: MissingIngestionFailureDetails | null
    lootauraVisible?: boolean
    missingIngestionReplayCount?: number
    missingIngestionLastRetryAt?: string | null
    resetFetchFailedReplay?: boolean
  },
  nowIso: string = new Date().toISOString()
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    missing_ingestion_attempted_at: nowIso,
    missing_ingestion_outcome: patch.outcome,
    missing_ingestion_failure_reason: patch.failureReason ?? null,
    updated_at: nowIso,
  }
  if (patch.missingIngestionFailureDetails !== undefined) {
    update.missing_ingestion_failure_details = patch.missingIngestionFailureDetails
  } else if (
    patch.outcome === 'published' ||
    patch.outcome === 'ingested' ||
    patch.outcome === 'skipped_visible' ||
    patch.outcome === 'skipped_existing'
  ) {
    update.missing_ingestion_failure_details = null
  }
  if (patch.resetFetchFailedReplay) {
    update.missing_ingestion_replay_count = 0
    update.missing_ingestion_last_retry_at = null
  } else if (patch.missingIngestionReplayCount != null) {
    update.missing_ingestion_replay_count = patch.missingIngestionReplayCount
  }
  if (patch.missingIngestionLastRetryAt !== undefined) {
    update.missing_ingestion_last_retry_at = patch.missingIngestionLastRetryAt
  }
  if (patch.lootauraVisible === true) {
    update.lootaura_visible = true
  }
  if (shouldInvalidateObservationForExpiredMissingIngest(patch.outcome, patch.failureReason)) {
    Object.assign(update, buildExpiredObservationInvalidationFields())
  }
  return update
}

export async function recordYstmCoverageMissingIngestionOutcome(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  patch: {
    outcome: YstmCoverageMissingIngestionOutcome
    failureReason?: string | null
    missingIngestionFailureDetails?: MissingIngestionFailureDetails | null
    lootauraVisible?: boolean
    missingIngestionReplayCount?: number
    missingIngestionLastRetryAt?: string | null
    resetFetchFailedReplay?: boolean
  }
): Promise<void> {
  const nowIso = new Date().toISOString()
  const { error } = await fromBase(admin, 'ystm_coverage_observations')
    .update(buildMissingIngestionObservationUpdate(patch, nowIso))
    .eq('canonical_url', canonicalUrl)
  if (error) {
    throw new Error(error.message)
  }

  if (patch.outcome === 'ingested' || patch.outcome === 'published') {
    await markYstmCoverageObservationFirstIngested(admin, canonicalUrl, nowIso)
  }
  if (patch.outcome === 'published') {
    await markYstmCoverageObservationFirstPublished(admin, canonicalUrl, nowIso)
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
        case 'terminal':
          missingIngestionFailed += 1
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

export async function loadYstmCoverageConfigStalenessHoursByKey(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<Record<string, number | null>> {
  const pageSize = 1000
  let from = 0
  const lastSeenByConfigKey = new Map<string, string>()

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('config_key, last_list_seen_at')
      .not('config_key', 'is', null)
      .order('config_key', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as Array<{
      config_key: string | null
      last_list_seen_at: string | null
    }>
    for (const row of chunk) {
      const configKey = row.config_key?.trim()
      if (!configKey || !row.last_list_seen_at) continue
      const existing = lastSeenByConfigKey.get(configKey)
      if (!existing || Date.parse(row.last_list_seen_at) > Date.parse(existing)) {
        lastSeenByConfigKey.set(configKey, row.last_list_seen_at)
      }
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  const result: Record<string, number | null> = {}
  for (const [configKey, lastSeenAt] of lastSeenByConfigKey.entries()) {
    const seenMs = Date.parse(lastSeenAt)
    if (!Number.isFinite(seenMs)) {
      result[configKey] = null
      continue
    }
    result[configKey] = (nowMs - seenMs) / (60 * 60 * 1000)
  }
  return result
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
