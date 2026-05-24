import {
  BOOTSTRAP_COVERAGE_EXISTING_REFRESH,
  STEADY_COVERAGE_EXISTING_REFRESH,
} from '@/lib/ingestion/ystmCoverage/coverageBudgetProfiles'

const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_MAX_RUNTIME_MS = 300_000

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
  env: NodeJS.ProcessEnv = process.env,
  bootstrapEnabled = false
): YstmExistingUrlRefreshBudgets {
  const profile = bootstrapEnabled ? BOOTSTRAP_COVERAGE_EXISTING_REFRESH : STEADY_COVERAGE_EXISTING_REFRESH
  return {
    maxRefreshesPerRun: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_MAX_ATTEMPTS,
      profile.maxRefreshesPerRun,
      profile.maxRefreshesCap
    ),
    maxCandidatesScannedPerRun: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_MAX_SCANNED,
      profile.maxCandidatesScannedPerRun,
      profile.maxCandidatesScannedCap
    ),
    staleSyncHours: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_STALE_HOURS,
      profile.staleSyncHours,
      profile.staleSyncHoursCap
    ),
    leaseSeconds: parsePositiveInt(env.CRON_YSTM_EXISTING_REFRESH_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 900),
    maxRuntimeMs: parsePositiveInt(
      env.CRON_YSTM_EXISTING_REFRESH_MAX_RUNTIME_MS,
      DEFAULT_MAX_RUNTIME_MS,
      300_000
    ),
  }
}
