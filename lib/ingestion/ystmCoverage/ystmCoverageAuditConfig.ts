const DEFAULT_MAX_CONFIGS = 8
const DEFAULT_MAX_LIST_FETCHES = 12
const DEFAULT_MAX_DETAIL_VALIDATIONS = 24
const DEFAULT_MAX_URLS_PER_LIST_PAGE = 80
const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_MAX_RUNTIME_MS = 240_000

function parsePositiveInt(raw: string | undefined, fallback: number, cap: number): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, cap)
}

export const YSTM_COVERAGE_AUDIT_STATE_KEY = 'ystm_coverage_audit'

export type YstmCoverageAuditBudgets = {
  maxConfigsPerRun: number
  maxListFetchesPerRun: number
  maxDetailValidationsPerRun: number
  maxUrlsPerListPage: number
  leaseSeconds: number
  maxRuntimeMs: number
}

export function parseYstmCoverageAuditBudgets(env: NodeJS.ProcessEnv = process.env): YstmCoverageAuditBudgets {
  return {
    maxConfigsPerRun: parsePositiveInt(env.CRON_YSTM_COVERAGE_MAX_CONFIGS, DEFAULT_MAX_CONFIGS, 40),
    maxListFetchesPerRun: parsePositiveInt(
      env.CRON_YSTM_COVERAGE_MAX_LIST_FETCHES,
      DEFAULT_MAX_LIST_FETCHES,
      80
    ),
    maxDetailValidationsPerRun: parsePositiveInt(
      env.CRON_YSTM_COVERAGE_MAX_DETAIL_VALIDATIONS,
      DEFAULT_MAX_DETAIL_VALIDATIONS,
      120
    ),
    maxUrlsPerListPage: parsePositiveInt(
      env.CRON_YSTM_COVERAGE_MAX_URLS_PER_LIST_PAGE,
      DEFAULT_MAX_URLS_PER_LIST_PAGE,
      200
    ),
    leaseSeconds: parsePositiveInt(env.CRON_YSTM_COVERAGE_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 900),
    maxRuntimeMs: parsePositiveInt(env.CRON_YSTM_COVERAGE_MAX_RUNTIME_MS, DEFAULT_MAX_RUNTIME_MS, 300_000),
  }
}
