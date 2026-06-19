/** Hardcoded budgets for YSTM fresh discovery cron (no env vars). */

export type YstmFreshDiscoveryBudgets = {
  maxConfigsPerRun: number
  maxListFetchesPerRun: number
  maxInlineIngestPerRun: number
  maxUrlsPerListPage: number
  maxRuntimeMs: number
  leaseSeconds: number
}

export const YSTM_FRESH_DISCOVERY_BUDGETS: YstmFreshDiscoveryBudgets = {
  maxConfigsPerRun: 120,
  maxListFetchesPerRun: 120,
  maxInlineIngestPerRun: 80,
  maxUrlsPerListPage: 200,
  maxRuntimeMs: 280_000,
  leaseSeconds: 300,
}

export const YSTM_FRESH_DISCOVERY_STATE_KEY = 'ystm_fresh_discovery'

export const HOT_DISCOVERY_AGE_HOURS = 24

export const HOT_MISSING_INGEST_BUDGET_RATIO = 0.85
