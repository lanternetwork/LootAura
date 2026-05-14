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

function neverSynced(row: ReconciliationCandidateRow): boolean {
  return row.last_source_sync_at == null || row.last_source_sync_at.trim() === ''
}

function hasFailures(row: ReconciliationCandidateRow): boolean {
  return row.source_sync_failure_count > 0 || row.source_sync_status === 'source_missing_soft'
}

function scoreCandidate(row: ReconciliationCandidateRow, nowMs: number): ScoredReconciliationCandidate {
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
  const sortKey: readonly [number, number, number, string] = [tierN, placeholderN, neverN, row.id]

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
