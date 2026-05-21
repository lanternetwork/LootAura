import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { YstmCoverageMissingIngestionBudgets } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingIngestionConfig'

export type YstmCoverageMissingCandidate = {
  canonicalUrl: string
  city: string | null
  state: string | null
  configKey: string | null
  missingIngestionOutcome: string | null
  missingIngestionAttemptedAt: string | null
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

async function countMissingQueueTotal(admin: ReturnType<typeof getAdminDb>): Promise<number> {
  const { count, error } = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .eq('ystm_valid_active', true)
    .eq('lootaura_visible', false)
  if (error) {
    throw new Error(error.message)
  }
  return count ?? 0
}

/**
 * Loads a bounded page of missing valid URLs ordered by canonical_url, starting at queueOffset.
 */
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
  const queueTotal = await countMissingQueueTotal(admin)
  if (queueTotal === 0) {
    return { candidates: [], queueOffset: 0, queueTotal: 0, nextQueueOffset: 0 }
  }

  const offset = params.queueOffset % queueTotal
  const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
    .select(
      'canonical_url, city, state, config_key, missing_ingestion_outcome, missing_ingestion_attempted_at'
    )
    .eq('ystm_valid_active', true)
    .eq('lootaura_visible', false)
    .order('missing_ingestion_attempted_at', { ascending: true, nullsFirst: true })
    .order('canonical_url', { ascending: true })
    .range(offset, offset + params.scanLimit - 1)
  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as ObservationDbRow[]
  const candidates: YstmCoverageMissingCandidate[] = []
  for (const row of rows) {
    const mapped: YstmCoverageMissingCandidate = {
      canonicalUrl: row.canonical_url,
      city: row.city,
      state: row.state,
      configKey: row.config_key,
      missingIngestionOutcome: row.missing_ingestion_outcome,
      missingIngestionAttemptedAt: row.missing_ingestion_attempted_at,
    }
    if (!isEligibleForMissingIngestionRetry(mapped, nowMs, params.budgets.failedRetryHours)) {
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
