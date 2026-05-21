/** Burn-in defaults per docs/YSTM_90_PERCENT_COVERAGE_SPEC.md (Phase 4). */
const DEFAULT_MAX_REFRESHES_PER_RUN = 32
const DEFAULT_MAX_CANDIDATES_SCANNED = 120
const DEFAULT_STALE_SYNC_HOURS = 12
const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_MAX_RUNTIME_MS = 240_000

function parsePositiveInt(raw: string | undefined, fallback: number, cap: number): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, cap)
}

export const YSTM_COVERAGE_EXISTING_REFRESH_STATE_KEY = 'ystm_coverage_existing_refresh'

export type YstmExistingUrlRefreshBudgets = {
  maxRefreshesPerRun: number
  maxCandidatesScannedPerRun: number
  staleSyncHours: number
  leaseSeconds: number
  maxRuntimeMs: number
}

export function parseYstmExistingUrlRefreshBudgets(
  env: NodeJS.ProcessEnv = process.env
): YstmExistingUrlRefreshBudgets {
  return {
    maxRefreshesPerRun: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_MAX_ATTEMPTS,
      DEFAULT_MAX_REFRESHES_PER_RUN,
      80
    ),
    maxCandidatesScannedPerRun: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_MAX_SCANNED,
      DEFAULT_MAX_CANDIDATES_SCANNED,
      200
    ),
    staleSyncHours: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_STALE_HOURS,
      DEFAULT_STALE_SYNC_HOURS,
      168
    ),
    leaseSeconds: parsePositiveInt(env.CRON_YSTM_EXISTING_REFRESH_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 900),
    maxRuntimeMs: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_MAX_RUNTIME_MS,
      DEFAULT_MAX_RUNTIME_MS,
      300_000
    ),
  }
}
