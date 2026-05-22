/** Graph enumeration burn-in per YSTM nationwide graph enumeration spec (Phase 4). */
const DEFAULT_MAX_STATES = 10
const DEFAULT_MAX_DISCOVERED = 1000
const DEFAULT_MAX_VALIDATION_FETCHES = 500
const DEFAULT_MAX_REVALIDATION_CONFIGS = 120
const DEFAULT_MAX_PLACEHOLDER_REPAIR_CONFIGS = 120
const DEFAULT_INDEX_FETCH_CONCURRENCY = 2
const DEFAULT_VALIDATION_FETCH_CONCURRENCY = 4
const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_MAX_RUNTIME_MS = 240_000
const DEFAULT_PLACEHOLDER_FAILURE_EXCLUDE_THRESHOLD = 1

function parsePositiveInt(raw: string | undefined, fallback: number, cap: number): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, cap)
}

export type DiscoveryCronBudgets = {
  maxStatesPerRun: number
  maxDiscoveredPagesPerRun: number
  maxValidationFetchesPerRun: number
  maxRevalidationConfigsPerRun: number
  /** Phase 2: bounded repair pass for enabled configs with empty source_pages. */
  maxPlaceholderRepairConfigsPerRun: number
  indexFetchConcurrency: number
  validationFetchConcurrency: number
  leaseSeconds: number
  maxRuntimeMs: number
  placeholderFailureExcludeThreshold: number
}

export function parseDiscoveryCronBudgets(env: NodeJS.ProcessEnv = process.env): DiscoveryCronBudgets {
  return {
    maxStatesPerRun: parsePositiveInt(
      env.CRON_DISCOVERY_MAX_STATES_PER_RUN ?? env.YSTM_GRAPH_ENUMERATION_STATES_PER_RUN,
      DEFAULT_MAX_STATES,
      25
    ),
    maxDiscoveredPagesPerRun: parsePositiveInt(
      env.CRON_DISCOVERY_MAX_DISCOVERED_PAGES ?? env.YSTM_GRAPH_ENUMERATION_MAX_CANDIDATES_PER_RUN,
      DEFAULT_MAX_DISCOVERED,
      5000
    ),
    maxValidationFetchesPerRun: parsePositiveInt(
      env.CRON_DISCOVERY_MAX_VALIDATION_FETCHES ?? env.YSTM_GRAPH_ENUMERATION_MAX_VALIDATIONS_PER_RUN,
      DEFAULT_MAX_VALIDATION_FETCHES,
      2000
    ),
    maxRevalidationConfigsPerRun: parsePositiveInt(
      env.CRON_DISCOVERY_MAX_REVALIDATION_CONFIGS,
      DEFAULT_MAX_REVALIDATION_CONFIGS,
      200
    ),
    maxPlaceholderRepairConfigsPerRun: parsePositiveInt(
      env.CRON_DISCOVERY_MAX_PLACEHOLDER_REPAIR_CONFIGS,
      DEFAULT_MAX_PLACEHOLDER_REPAIR_CONFIGS,
      200
    ),
    indexFetchConcurrency: parsePositiveInt(
      env.CRON_DISCOVERY_INDEX_FETCH_CONCURRENCY,
      DEFAULT_INDEX_FETCH_CONCURRENCY,
      5
    ),
    validationFetchConcurrency: parsePositiveInt(
      env.CRON_DISCOVERY_VALIDATION_FETCH_CONCURRENCY ?? env.YSTM_GRAPH_ENUMERATION_CONCURRENCY,
      DEFAULT_VALIDATION_FETCH_CONCURRENCY,
      8
    ),
    leaseSeconds: parsePositiveInt(env.CRON_DISCOVERY_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 900),
    maxRuntimeMs: parsePositiveInt(env.CRON_DISCOVERY_MAX_RUNTIME_MS, DEFAULT_MAX_RUNTIME_MS, 300_000),
    placeholderFailureExcludeThreshold: parsePositiveInt(
      env.CRON_DISCOVERY_PLACEHOLDER_EXCLUDE_AFTER_FAILURES,
      DEFAULT_PLACEHOLDER_FAILURE_EXCLUDE_THRESHOLD,
      5
    ),
  }
}
