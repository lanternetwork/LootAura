import {
  BOOTSTRAP_COVERAGE_MISSING_INGEST,
  STEADY_COVERAGE_MISSING_INGEST,
} from '@/lib/ingestion/ystmCoverage/coverageBudgetProfiles'

const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_MAX_RUNTIME_MS = 300_000

function parsePositiveInt(raw: string | undefined, fallback: number, cap: number): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, cap)
}

export const YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY = 'ystm_coverage_missing_ingestion'

export type YstmCoverageMissingIngestionBudgets = {
  maxAttemptsPerRun: number
  maxCandidatesScannedPerRun: number
  failedRetryHours: number
  leaseSeconds: number
  maxRuntimeMs: number
}

export function parseYstmCoverageMissingIngestionBudgets(
  env: NodeJS.ProcessEnv = process.env,
  bootstrapEnabled = false
): YstmCoverageMissingIngestionBudgets {
  const profile = bootstrapEnabled ? BOOTSTRAP_COVERAGE_MISSING_INGEST : STEADY_COVERAGE_MISSING_INGEST
  return {
    maxAttemptsPerRun: parsePositiveInt(
      env.CRON_YSTM_MISSING_INGEST_MAX_ATTEMPTS,
      profile.maxAttemptsPerRun,
      profile.maxAttemptsCap
    ),
    maxCandidatesScannedPerRun: parsePositiveInt(
      env.CRON_YSTM_MISSING_INGEST_MAX_SCANNED,
      profile.maxCandidatesScannedPerRun,
      profile.maxCandidatesScannedCap
    ),
    failedRetryHours: parsePositiveInt(
      env.CRON_YSTM_MISSING_INGEST_FAILED_RETRY_HOURS,
      profile.failedRetryHours,
      profile.failedRetryHoursCap
    ),
    leaseSeconds: parsePositiveInt(env.CRON_YSTM_MISSING_INGEST_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 900),
    maxRuntimeMs: parsePositiveInt(
      env.CRON_YSTM_MISSING_INGEST_MAX_RUNTIME_MS,
      DEFAULT_MAX_RUNTIME_MS,
      300_000
    ),
  }
}
