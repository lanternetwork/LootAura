import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { YstmCoverageMissingIngestionBudgets } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingIngestionConfig'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import { HOT_DISCOVERY_AGE_HOURS } from '@/lib/ingestion/ystmCoverage/ystmFreshDiscoveryConfig'

export type YstmCoverageMissingCandidate = {
  canonicalUrl: string
  city: string | null
  state: string | null
  configKey: string | null
  missingIngestionOutcome: string | null
  missingIngestionAttemptedAt: string | null
  missingIngestionReplayCount?: number
  discoveryPriority: string | null
  listMetadataSnapshot: YstmListMetadataSale | null
  firstListSeenAt: string | null
}

export type MissingIngestionCandidatePage = {
  candidates: YstmCoverageMissingCandidate[]
  queueOffset: number
  queueTotal: number
  nextQueueOffset: number
}

type ObservationDbRow = {
  canonical_url: string
  city: string | null
  state: string | null
  config_key: string | null
  missing_ingestion_outcome: string | null
  missing_ingestion_attempted_at: string | null
  missing_ingestion_replay_count: number | null
  discovery_priority: string | null
  list_metadata_snapshot: YstmListMetadataSale | null
  first_list_seen_at: string | null
}

export function isEligibleForMissingIngestionRetry(
  row: Pick<YstmCoverageMissingCandidate, 'missingIngestionOutcome' | 'missingIngestionAttemptedAt'>,
  nowMs: number,
  failedRetryHours: number
): boolean {
  if (!row.missingIngestionOutcome) return true
  if (row.missingIngestionOutcome !== 'failed') return false
  if (!row.missingIngestionAttemptedAt) return true
  const attemptedMs = Date.parse(row.missingIngestionAttemptedAt)
  if (!Number.isFinite(attemptedMs)) return true
  return nowMs - attemptedMs >= failedRetryHours * 60 * 60 * 1000
}

function mapObservationRow(row: ObservationDbRow): YstmCoverageMissingCandidate {
  return {
    canonicalUrl: row.canonical_url,
    city: row.city,
    state: row.state,
    configKey: row.config_key,
    missingIngestionOutcome: row.missing_ingestion_outcome,
    missingIngestionAttemptedAt: row.missing_ingestion_attempted_at,
    missingIngestionReplayCount: row.missing_ingestion_replay_count ?? undefined,
    discoveryPriority: row.discovery_priority,
    listMetadataSnapshot: row.list_metadata_snapshot,
    firstListSeenAt: row.first_list_seen_at,
  }
}

const MISSING_SELECT =
  'canonical_url, city, state, config_key, missing_ingestion_outcome, missing_ingestion_attempted_at, missing_ingestion_replay_count, discovery_priority, list_metadata_snapshot, first_list_seen_at'

async function countMissingQueue(
  admin: ReturnType<typeof getAdminDb>,
  priority: 'hot' | 'cold'
): Promise<number> {
  let query = fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .eq('ystm_valid_active', true)
    .eq('lootaura_visible', false)

  if (priority === 'hot') {
    query = query.in('discovery_priority', ['hot', 'warm'])
  } else {
    query = query.or('discovery_priority.eq.cold,discovery_priority.is.null')
  }

  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function countHotMissingQueueTotal(admin: ReturnType<typeof getAdminDb>): Promise<number> {
  return countMissingQueue(admin, 'hot')
}

export async function countColdMissingQueueTotal(admin: ReturnType<typeof getAdminDb>): Promise<number> {
  return countMissingQueue(admin, 'cold')
}

/**
 * Hot/warm missing URLs — freshest first.
 */
export async function fetchHotMissingIngestionCandidates(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    limit: number
    budgets: Pick<YstmCoverageMissingIngestionBudgets, 'failedRetryHours'>
    nowMs?: number
  }
): Promise<YstmCoverageMissingCandidate[]> {
  const nowMs = params.nowMs ?? Date.now()
  const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
    .select(MISSING_SELECT)
    .eq('ystm_valid_active', true)
    .eq('lootaura_visible', false)
    .in('discovery_priority', ['hot', 'warm'])
    .order('first_list_seen_at', { ascending: false, nullsFirst: false })
    .order('canonical_url', { ascending: true })
    .limit(params.limit * 3)
  if (error) throw new Error(error.message)

  const candidates: YstmCoverageMissingCandidate[] = []
  for (const row of (data ?? []) as ObservationDbRow[]) {
    const mapped = mapObservationRow(row)
    if (!isEligibleForMissingIngestionRetry(mapped, nowMs, params.budgets.failedRetryHours)) continue
    candidates.push(mapped)
    if (candidates.length >= params.limit) break
  }
  return candidates
}

/**
 * Loads a bounded page of cold missing valid URLs ordered by canonical_url, starting at queueOffset.
 */
export async function fetchColdMissingIngestionCandidatePage(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    queueOffset: number
    scanLimit: number
    budgets: Pick<YstmCoverageMissingIngestionBudgets, 'failedRetryHours'>
    nowMs?: number
  }
): Promise<MissingIngestionCandidatePage> {
  const nowMs = params.nowMs ?? Date.now()
  const queueTotal = await countColdMissingQueueTotal(admin)
  if (queueTotal === 0) {
    return { candidates: [], queueOffset: 0, queueTotal: 0, nextQueueOffset: 0 }
  }

  const offset = params.queueOffset % queueTotal
  const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
    .select(MISSING_SELECT)
    .eq('ystm_valid_active', true)
    .eq('lootaura_visible', false)
    .or('discovery_priority.eq.cold,discovery_priority.is.null')
    .order('missing_ingestion_attempted_at', { ascending: true, nullsFirst: true })
    .order('canonical_url', { ascending: true })
    .range(offset, offset + params.scanLimit - 1)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as ObservationDbRow[]
  const candidates: YstmCoverageMissingCandidate[] = []
  for (const row of rows) {
    const mapped = mapObservationRow(row)
    if (!isEligibleForMissingIngestionRetry(mapped, nowMs, params.budgets.failedRetryHours)) continue
    candidates.push(mapped)
  }

  const examined = rows.length
  const nextQueueOffset = examined === 0 ? offset : (offset + examined) % queueTotal

  return { candidates, queueOffset: offset, queueTotal, nextQueueOffset }
}

/** @deprecated Use hot/cold fetchers — retained for tests. */
export async function fetchMissingIngestionCandidatePage(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    queueOffset: number
    scanLimit: number
    budgets: Pick<YstmCoverageMissingIngestionBudgets, 'failedRetryHours'>
    nowMs?: number
  }
): Promise<MissingIngestionCandidatePage> {
  const nowMs = params.nowMs ?? Date.now()
  const { count, error } = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .eq('ystm_valid_active', true)
    .eq('lootaura_visible', false)
  if (error) throw new Error(error.message)
  const queueTotal = count ?? 0
  if (queueTotal === 0) {
    return { candidates: [], queueOffset: 0, queueTotal: 0, nextQueueOffset: 0 }
  }

  const offset = params.queueOffset % queueTotal
  const { data, error: pageError } = await fromBase(admin, 'ystm_coverage_observations')
    .select(MISSING_SELECT)
    .eq('ystm_valid_active', true)
    .eq('lootaura_visible', false)
    .order('missing_ingestion_attempted_at', { ascending: true, nullsFirst: true })
    .order('canonical_url', { ascending: true })
    .range(offset, offset + params.scanLimit - 1)
  if (pageError) throw new Error(pageError.message)

  const rows = (data ?? []) as ObservationDbRow[]
  const candidates: YstmCoverageMissingCandidate[] = []
  for (const row of rows) {
    const mapped = mapObservationRow(row)
    if (!isEligibleForMissingIngestionRetry(mapped, nowMs, params.budgets.failedRetryHours)) continue
    candidates.push(mapped)
  }

  const examined = rows.length
  const nextQueueOffset = examined === 0 ? offset : (offset + examined) % queueTotal
  return { candidates, queueOffset: offset, queueTotal, nextQueueOffset }
}

export function isWithinHotDiscoveryWindow(
  firstListSeenAt: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!firstListSeenAt) return true
  const seenMs = Date.parse(firstListSeenAt)
  if (!Number.isFinite(seenMs)) return true
  return nowMs - seenMs <= HOT_DISCOVERY_AGE_HOURS * 60 * 60 * 1000
}
