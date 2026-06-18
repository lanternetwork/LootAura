import {
  MISSING_INGEST_FETCH_FAILED_MAX_CLAIM_PER_RUN,
  MISSING_INGEST_FETCH_FAILED_MAX_REPLAY_FAILURES,
  MISSING_INGEST_FETCH_FAILED_MIN_RETRY_INTERVAL_HOURS,
  MISSING_INGEST_TERMINAL_FAILURE_REASON,
} from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedRecoveryConfig'
import { findPrimaryIngestedSaleBySourceUrl } from '@/lib/ingestion/identity/ingestedSaleSourceUrlLookup'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type MissingIngestFetchFailedCandidate = {
  canonicalUrl: string
  city: string | null
  state: string | null
  configKey: string | null
  missingIngestionOutcome: string | null
  missingIngestionAttemptedAt: string | null
  missingIngestionReplayCount: number
  missingIngestionLastRetryAt: string | null
}

type ObservationFetchFailedRow = {
  canonical_url: string
  city: string | null
  state: string | null
  config_key: string | null
  missing_ingestion_outcome: string | null
  missing_ingestion_attempted_at: string | null
  missing_ingestion_failure_reason: string | null
  missing_ingestion_replay_count: number | null
  missing_ingestion_last_retry_at: string | null
  ystm_valid_active: boolean
  lootaura_visible: boolean
}

export function isEligibleForFetchFailedReplayInterval(
  lastRetryAt: string | null,
  nowMs: number,
  minRetryIntervalHours: number = MISSING_INGEST_FETCH_FAILED_MIN_RETRY_INTERVAL_HOURS
): boolean {
  if (!lastRetryAt) return true
  const retryMs = Date.parse(lastRetryAt)
  if (!Number.isFinite(retryMs)) return true
  return nowMs - retryMs >= minRetryIntervalHours * 60 * 60 * 1000
}

export function isMissingIngestFetchFailedRetryableRow(
  row: Pick<
    ObservationFetchFailedRow,
    | 'ystm_valid_active'
    | 'lootaura_visible'
    | 'missing_ingestion_outcome'
    | 'missing_ingestion_failure_reason'
    | 'missing_ingestion_replay_count'
  > & {
    wouldPublish: boolean
    hasPrimaryIngestedRow: boolean
  }
): boolean {
  if (!row.ystm_valid_active || row.lootaura_visible) return false
  if (row.hasPrimaryIngestedRow) return false
  if (row.missing_ingestion_outcome === 'terminal') return false
  if (row.missing_ingestion_outcome !== 'failed') return false
  if (row.missing_ingestion_failure_reason !== 'fetch_failed') return false
  if ((row.missing_ingestion_replay_count ?? 0) >= MISSING_INGEST_FETCH_FAILED_MAX_REPLAY_FAILURES) {
    return false
  }
  if (!row.wouldPublish) return false
  return true
}

export async function loadWouldPublishShadowCanonicalUrls(
  admin: ReturnType<typeof getAdminDb>
): Promise<Set<string>> {
  const urls = new Set<string>()
  const pageSize = 1000
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_sale_instance_shadow_replays')
      .select('canonical_url')
      .eq('would_publish', true)
      .order('canonical_url', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as Array<{ canonical_url: string }>
    for (const row of chunk) {
      if (row.canonical_url) urls.add(row.canonical_url)
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return urls
}

export async function fetchMissingIngestFetchFailedCandidates(
  admin: ReturnType<typeof getAdminDb>,
  params?: {
    limit?: number
    nowMs?: number
    minRetryIntervalHours?: number
    wouldPublishUrls?: Set<string>
  }
): Promise<MissingIngestFetchFailedCandidate[]> {
  const nowMs = params?.nowMs ?? Date.now()
  const limit = Math.min(
    params?.limit ?? MISSING_INGEST_FETCH_FAILED_MAX_CLAIM_PER_RUN,
    MISSING_INGEST_FETCH_FAILED_MAX_CLAIM_PER_RUN
  )
  const wouldPublishUrls = params?.wouldPublishUrls ?? (await loadWouldPublishShadowCanonicalUrls(admin))
  const candidates: MissingIngestFetchFailedCandidate[] = []
  const pageSize = 200
  let from = 0

  while (candidates.length < limit) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select(
        'canonical_url, city, state, config_key, missing_ingestion_outcome, missing_ingestion_attempted_at, missing_ingestion_failure_reason, missing_ingestion_replay_count, missing_ingestion_last_retry_at, ystm_valid_active, lootaura_visible'
      )
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('missing_ingestion_outcome', 'failed')
      .eq('missing_ingestion_failure_reason', 'fetch_failed')
      .order('missing_ingestion_last_retry_at', { ascending: true, nullsFirst: true })
      .order('missing_ingestion_attempted_at', { ascending: true, nullsFirst: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as ObservationFetchFailedRow[]
    if (chunk.length === 0) break

    for (const row of chunk) {
      if (candidates.length >= limit) break
      if (!wouldPublishUrls.has(row.canonical_url)) continue
      if (
        !isEligibleForFetchFailedReplayInterval(
          row.missing_ingestion_last_retry_at,
          nowMs,
          params?.minRetryIntervalHours
        )
      ) {
        continue
      }

      const primary = await findPrimaryIngestedSaleBySourceUrl(admin, row.canonical_url, 'id, is_duplicate')
      const hasPrimaryIngestedRow = Boolean(primary?.id && !primary.is_duplicate)
      if (
        !isMissingIngestFetchFailedRetryableRow({
          ...row,
          wouldPublish: true,
          hasPrimaryIngestedRow,
        })
      ) {
        continue
      }

      candidates.push({
        canonicalUrl: row.canonical_url,
        city: row.city,
        state: row.state,
        configKey: row.config_key,
        missingIngestionOutcome: row.missing_ingestion_outcome,
        missingIngestionAttemptedAt: row.missing_ingestion_attempted_at,
        missingIngestionReplayCount: row.missing_ingestion_replay_count ?? 0,
        missingIngestionLastRetryAt: row.missing_ingestion_last_retry_at,
      })
    }

    if (chunk.length < pageSize) break
    from += pageSize
  }

  return candidates
}

export type MissingIngestFetchFailedAggregate = {
  retryableCount: number
  terminalized: number
  retriedLast24h: number
  successfulReplaysLast24h: number
  failedReplaysLast24h: number
  ageDistribution: Record<string, number>
  oldestLastAttemptAt: string | null
}

function ageBucketFromAttemptedAt(attemptedAt: string | null, nowMs: number): string {
  if (!attemptedAt) return 'unknown'
  const attemptedMs = Date.parse(attemptedAt)
  if (!Number.isFinite(attemptedMs)) return 'unknown'
  const ageMs = nowMs - attemptedMs
  if (ageMs < 7 * 24 * 60 * 60 * 1000) return '0-7d'
  if (ageMs < 30 * 24 * 60 * 60 * 1000) return '7-30d'
  if (ageMs < 90 * 24 * 60 * 60 * 1000) return '30-90d'
  return '90+d'
}

export async function aggregateMissingIngestFetchFailed(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<MissingIngestFetchFailedAggregate> {
  const retriedCutoffIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const retryableCandidates = await fetchMissingIngestFetchFailedCandidates(admin, {
    limit: MISSING_INGEST_FETCH_FAILED_MAX_CLAIM_PER_RUN,
    nowMs,
  })

  const ageDistribution: Record<string, number> = {}
  let oldestLastAttemptAt: string | null = null
  for (const candidate of retryableCandidates) {
    const bucket = ageBucketFromAttemptedAt(candidate.missingIngestionAttemptedAt, nowMs)
    ageDistribution[bucket] = (ageDistribution[bucket] ?? 0) + 1
    if (candidate.missingIngestionAttemptedAt) {
      if (
        !oldestLastAttemptAt ||
        Date.parse(candidate.missingIngestionAttemptedAt) < Date.parse(oldestLastAttemptAt)
      ) {
        oldestLastAttemptAt = candidate.missingIngestionAttemptedAt
      }
    }
  }

  const terminalizedResult = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .eq('missing_ingestion_outcome', 'terminal')
    .eq('missing_ingestion_failure_reason', MISSING_INGEST_TERMINAL_FAILURE_REASON)
  if (terminalizedResult.error) {
    throw new Error(terminalizedResult.error.message)
  }

  const retriedLast24hResult = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .gte('missing_ingestion_last_retry_at', retriedCutoffIso)
  if (retriedLast24hResult.error) {
    throw new Error(retriedLast24hResult.error.message)
  }

  const successfulReplaysLast24hResult = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .gt('missing_ingestion_replay_count', 0)
    .in('missing_ingestion_outcome', ['published', 'ingested'])
    .gte('missing_ingestion_attempted_at', retriedCutoffIso)
  if (successfulReplaysLast24hResult.error) {
    throw new Error(successfulReplaysLast24hResult.error.message)
  }

  const failedReplaysLast24hResult = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .eq('missing_ingestion_outcome', 'failed')
    .eq('missing_ingestion_failure_reason', 'fetch_failed')
    .gt('missing_ingestion_replay_count', 0)
    .gte('missing_ingestion_last_retry_at', retriedCutoffIso)
  if (failedReplaysLast24hResult.error) {
    throw new Error(failedReplaysLast24hResult.error.message)
  }

  return {
    retryableCount: retryableCandidates.length,
    terminalized: terminalizedResult.count ?? 0,
    retriedLast24h: retriedLast24hResult.count ?? 0,
    successfulReplaysLast24h: successfulReplaysLast24hResult.count ?? 0,
    failedReplaysLast24h: failedReplaysLast24hResult.count ?? 0,
    ageDistribution,
    oldestLastAttemptAt,
  }
}
