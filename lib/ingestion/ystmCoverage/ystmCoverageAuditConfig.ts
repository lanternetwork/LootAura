import {
  BOOTSTRAP_COVERAGE_AUDIT,
  STEADY_COVERAGE_AUDIT,
} from '@/lib/ingestion/ystmCoverage/coverageBudgetProfiles'

const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_MAX_RUNTIME_MS = 300_000

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

export function parseYstmCoverageAuditBudgets(
  env: NodeJS.ProcessEnv = process.env,
  bootstrapEnabled = false
): YstmCoverageAuditBudgets {
  const profile = bootstrapEnabled ? BOOTSTRAP_COVERAGE_AUDIT : STEADY_COVERAGE_AUDIT
  return {
    maxConfigsPerRun: parsePositiveInt(
      env.CRON_YSTM_COVERAGE_MAX_CONFIGS,
      profile.maxConfigsPerRun,
      profile.maxConfigsCap
    ),
    maxListFetchesPerRun: parsePositiveInt(
      env.CRON_YSTM_COVERAGE_MAX_LIST_FETCHES,
      profile.maxListFetchesPerRun,
      profile.maxListFetchesCap
    ),
    maxDetailValidationsPerRun: parsePositiveInt(
      env.CRON_YSTM_COVERAGE_MAX_DETAIL_VALIDATIONS,
      profile.maxDetailValidationsPerRun,
      profile.maxDetailValidationsCap
    ),
    maxUrlsPerListPage: parsePositiveInt(
      env.CRON_YSTM_COVERAGE_MAX_URLS_PER_LIST_PAGE,
      profile.maxUrlsPerListPage,
      profile.maxUrlsPerListPageCap
    ),
    leaseSeconds: parsePositiveInt(env.CRON_YSTM_COVERAGE_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 900),
    maxRuntimeMs: parsePositiveInt(env.CRON_YSTM_COVERAGE_MAX_RUNTIME_MS, DEFAULT_MAX_RUNTIME_MS, 300_000),
  }
}
