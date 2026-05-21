/** Burn-in defaults per docs/YSTM_90_PERCENT_COVERAGE_SPEC.md (Phase 5). */
const DEFAULT_MAX_REPAIRS_PER_RUN = 60
const DEFAULT_MAX_CANDIDATES_SCANNED = 160
const DEFAULT_FAILED_RETRY_HOURS = 6
const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_MAX_RUNTIME_MS = 240_000

function parsePositiveInt(raw: string | undefined, fallback: number, cap: number): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, cap)
}

export const YSTM_COVERAGE_CATALOG_REPAIR_STATE_KEY = 'ystm_coverage_catalog_repair'

export const YSTM_CATALOG_REPAIRABLE_STATUSES = [
  'needs_geocode',
  'ready',
  'publish_failed',
  'needs_check',
] as const

export type YstmCatalogRepairBudgets = {
  maxRepairsPerRun: number
  maxCandidatesScannedPerRun: number
  failedRetryHours: number
  leaseSeconds: number
  maxRuntimeMs: number
}

export function parseYstmCatalogRepairBudgets(
  env: NodeJS.ProcessEnv = process.env
): YstmCatalogRepairBudgets {
  return {
    maxRepairsPerRun: parsePositiveInt(
      env.CRON_YSTM_CATALOG_REPAIR_MAX_ATTEMPTS,
      DEFAULT_MAX_REPAIRS_PER_RUN,
      100
    ),
    maxCandidatesScannedPerRun: parsePositiveInt(
      env.CRON_YSTM_CATALOG_REPAIR_MAX_SCANNED,
      DEFAULT_MAX_CANDIDATES_SCANNED,
      250
    ),
    failedRetryHours: parsePositiveInt(
      env.CRON_YSTM_CATALOG_REPAIR_FAILED_RETRY_HOURS,
      DEFAULT_FAILED_RETRY_HOURS,
      72
    ),
    leaseSeconds: parsePositiveInt(env.CRON_YSTM_CATALOG_REPAIR_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 900),
    maxRuntimeMs: parsePositiveInt(
      env.CRON_YSTM_CATALOG_REPAIR_MAX_RUNTIME_MS,
      DEFAULT_MAX_RUNTIME_MS,
      300_000
    ),
  }
}
