import type { ReconciliationCandidateRow } from '@/lib/reconciliation/types'

export type SelectionTier = 'high' | 'normal' | 'low'

export interface ScoredReconciliationCandidate {
  readonly row: ReconciliationCandidateRow
  readonly sortKey: readonly [number, number, number, string]
}

function tierRank(tier: SelectionTier): number {
  if (tier === 'high') return 0
  if (tier === 'normal') return 1
  return 2
}

function neverSynced(row: Pick<ReconciliationCandidateRow, 'last_source_sync_at'>): boolean {
  return row.last_source_sync_at == null || row.last_source_sync_at.trim() === ''
}

function hasFailures(
  row: Pick<ReconciliationCandidateRow, 'source_sync_failure_count' | 'source_sync_status'>
): boolean {
  return row.source_sync_failure_count > 0 || row.source_sync_status === 'source_missing_soft'
}

/**
 * Deterministic sort key for reconciliation candidate ordering (must stay aligned with
 * `reconciliation_candidate_rows_page` in `175_reconciliation_candidate_coverage.sql`).
 */
export function computeReconciliationSortKey(
  row: Pick<
    ReconciliationCandidateRow,
    'id' | 'source_placeholder_detected' | 'last_source_sync_at' | 'source_sync_failure_count' | 'source_sync_status'
  >,
  nowMs: number
): readonly [number, number, number, string] {
  let tier: SelectionTier = 'normal'
  if (row.source_placeholder_detected || neverSynced(row) || hasFailures(row)) {
    tier = 'high'
  } else {
    const staleMs = 6 * 60 * 60 * 1000
    const last = row.last_source_sync_at ? Date.parse(row.last_source_sync_at) : NaN
    if (Number.isFinite(last) && nowMs - last > staleMs) {
      tier = 'normal'
    } else {
      tier = 'low'
    }
  }

  const tierN = tierRank(tier)
  const placeholderN = row.source_placeholder_detected ? 0 : 1
  const neverN = neverSynced(row) ? 0 : 1
  return [tierN, placeholderN, neverN, row.id]
}

function scoreCandidate(row: ReconciliationCandidateRow, nowMs: number): ScoredReconciliationCandidate {
  const sortKey = computeReconciliationSortKey(row, nowMs)
  return { row, sortKey }
}

/**
 * Deterministic ordering: tier (HIGH first), placeholder rows, never-synced, then stable id.
 */
export function orderReconciliationCandidates(
  rows: readonly ReconciliationCandidateRow[],
  nowMs: number
): ReconciliationCandidateRow[] {
  const scored = rows.map((r) => scoreCandidate(r, nowMs))
  scored.sort((a, b) => {
    for (let i = 0; i < 4; i += 1) {
      const av = a.sortKey[i] ?? ''
      const bv = b.sortKey[i] ?? ''
      if (av === bv) continue
      if (typeof av === 'number' && typeof bv === 'number') return av - bv
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv)
    }
    return 0
  })
  return scored.map((s) => s.row)
}
