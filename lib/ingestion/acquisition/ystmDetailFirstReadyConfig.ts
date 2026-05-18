/** Phase 3B: bounded concurrency for YSTM detail-first READY fast-path. */

const DEFAULT_DETAIL_FETCH_CONCURRENCY = 3
const MAX_DETAIL_FETCH_CONCURRENCY = 8

export function parseYstmDetailFirstConcurrencyFromEnv(): number {
  const raw = process.env.YSTM_DETAIL_FIRST_CONCURRENCY
  if (raw === undefined || raw === '') return DEFAULT_DETAIL_FETCH_CONCURRENCY
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DETAIL_FETCH_CONCURRENCY
  return Math.min(parsed, MAX_DETAIL_FETCH_CONCURRENCY)
}
