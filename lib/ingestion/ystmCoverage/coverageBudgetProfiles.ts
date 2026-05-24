/** Steady-state vs bootstrap nationwide coverage throughput (code-only; no env flag). */

export type CoverageAuditBudgetProfile = {
  maxConfigsPerRun: number
  maxConfigsCap: number
  maxListFetchesPerRun: number
  maxListFetchesCap: number
  maxDetailValidationsPerRun: number
  maxDetailValidationsCap: number
  maxUrlsPerListPage: number
  maxUrlsPerListPageCap: number
}

export type CoverageMissingIngestBudgetProfile = {
  maxAttemptsPerRun: number
  maxAttemptsCap: number
  maxCandidatesScannedPerRun: number
  maxCandidatesScannedCap: number
  failedRetryHours: number
  failedRetryHoursCap: number
}

export type CoverageCatalogRepairBudgetProfile = {
  maxRepairsPerRun: number
  maxRepairsCap: number
  maxCandidatesScannedPerRun: number
  maxCandidatesScannedCap: number
  failedRetryHours: number
  failedRetryHoursCap: number
}

export type CoverageExistingRefreshBudgetProfile = {
  maxRefreshesPerRun: number
  maxRefreshesCap: number
  maxCandidatesScannedPerRun: number
  maxCandidatesScannedCap: number
  staleSyncHours: number
  staleSyncHoursCap: number
}

export const STEADY_COVERAGE_AUDIT: CoverageAuditBudgetProfile = {
  maxConfigsPerRun: 40,
  maxConfigsCap: 40,
  maxListFetchesPerRun: 80,
  maxListFetchesCap: 80,
  maxDetailValidationsPerRun: 120,
  maxDetailValidationsCap: 120,
  maxUrlsPerListPage: 200,
  maxUrlsPerListPageCap: 200,
}

export const BOOTSTRAP_COVERAGE_AUDIT: CoverageAuditBudgetProfile = {
  maxConfigsPerRun: 80,
  maxConfigsCap: 80,
  maxListFetchesPerRun: 160,
  maxListFetchesCap: 160,
  maxDetailValidationsPerRun: 300,
  maxDetailValidationsCap: 300,
  maxUrlsPerListPage: 200,
  maxUrlsPerListPageCap: 200,
}

export const STEADY_COVERAGE_MISSING_INGEST: CoverageMissingIngestBudgetProfile = {
  maxAttemptsPerRun: 60,
  maxAttemptsCap: 60,
  maxCandidatesScannedPerRun: 200,
  maxCandidatesScannedCap: 200,
  failedRetryHours: 6,
  failedRetryHoursCap: 72,
}

export const BOOTSTRAP_COVERAGE_MISSING_INGEST: CoverageMissingIngestBudgetProfile = {
  maxAttemptsPerRun: 120,
  maxAttemptsCap: 120,
  maxCandidatesScannedPerRun: 400,
  maxCandidatesScannedCap: 400,
  failedRetryHours: 2,
  failedRetryHoursCap: 72,
}

export const STEADY_COVERAGE_CATALOG_REPAIR: CoverageCatalogRepairBudgetProfile = {
  maxRepairsPerRun: 100,
  maxRepairsCap: 100,
  maxCandidatesScannedPerRun: 250,
  maxCandidatesScannedCap: 250,
  failedRetryHours: 6,
  failedRetryHoursCap: 72,
}

export const BOOTSTRAP_COVERAGE_CATALOG_REPAIR: CoverageCatalogRepairBudgetProfile = {
  maxRepairsPerRun: 150,
  maxRepairsCap: 150,
  maxCandidatesScannedPerRun: 400,
  maxCandidatesScannedCap: 400,
  failedRetryHours: 2,
  failedRetryHoursCap: 72,
}

export const STEADY_COVERAGE_EXISTING_REFRESH: CoverageExistingRefreshBudgetProfile = {
  maxRefreshesPerRun: 80,
  maxRefreshesCap: 80,
  maxCandidatesScannedPerRun: 200,
  maxCandidatesScannedCap: 200,
  staleSyncHours: 12,
  staleSyncHoursCap: 168,
}

export const BOOTSTRAP_COVERAGE_EXISTING_REFRESH: CoverageExistingRefreshBudgetProfile = {
  maxRefreshesPerRun: 100,
  maxRefreshesCap: 100,
  maxCandidatesScannedPerRun: 200,
  maxCandidatesScannedCap: 200,
  staleSyncHours: 8,
  staleSyncHoursCap: 168,
}

/** Minimum hours bootstrap must run before auto-disable on exit criteria. */
export const COVERAGE_BOOTSTRAP_MIN_ENABLED_HOURS = 24

/** Interim footprint for auto-disable (G4 uses 5000). */
export const COVERAGE_BOOTSTRAP_EXIT_MIN_VALID_ACTIVE_URLS = 3000
