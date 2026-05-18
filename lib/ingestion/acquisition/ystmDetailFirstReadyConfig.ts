/** Phase 3B: detail-first READY fast-path (feature flag + throughput knobs). */

export function isYstmDetailFirstReadyEnabled(): boolean {
  const raw = process.env.YSTM_DETAIL_FIRST_READY_ENABLED
  if (raw === undefined || raw === '') return false
  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

const DEFAULT_DETAIL_FETCH_CONCURRENCY = 3
const MAX_DETAIL_FETCH_CONCURRENCY = 8

export function parseYstmDetailFirstConcurrencyFromEnv(): number {
  const raw = process.env.YSTM_DETAIL_FIRST_CONCURRENCY
  if (raw === undefined || raw === '') return DEFAULT_DETAIL_FETCH_CONCURRENCY
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DETAIL_FETCH_CONCURRENCY
  return Math.min(parsed, MAX_DETAIL_FETCH_CONCURRENCY)
}
