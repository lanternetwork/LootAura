/**
 * Canonical ingestion orchestration defaults (must match `app/api/cron/daily/route.ts` parsers).
 * Used for adaptive `normal` profile parity and metrics estimates.
 * Default orchestration budgets for ingestion cron jobs.
 */

export const INGESTION_ORCHESTRATION_DEFAULTS = {
  configBatchSize: 60,
  executionBudgetMs: 120_000,
  minIntervalMinutes: 10,
  domainSpacingMs: 500,
  geocodeBacklogBatchSize: 40,
  geocodeCronQueueBatchSize: 40,
  geocodeConcurrencyCeiling: 4,
  publishBatchSize: 200,
} as const

/** Nationwide coverage bootstrap Phase 6 burn-in (DB flag `coverage_bootstrap_nationwide`). */
export const INGESTION_ORCHESTRATION_BOOTSTRAP_DEFAULTS = {
  configBatchSize: 120,
  executionBudgetMs: 180_000,
  minIntervalMinutes: 10,
  domainSpacingMs: 350,
  geocodeBacklogBatchSize: 80,
  geocodeCronQueueBatchSize: 80,
  geocodeConcurrencyCeiling: 5,
  publishBatchSize: 500,
} as const

function orchestrationDefaultsForMode(bootstrapEnabled: boolean) {
  return bootstrapEnabled ? INGESTION_ORCHESTRATION_BOOTSTRAP_DEFAULTS : INGESTION_ORCHESTRATION_DEFAULTS
}

export const INGESTION_ORCHESTRATION_HARD_CAPS = {
  configBatchSize: 500,
  executionBudgetMs: 240_000,
  geocodeBacklogBatchSize: 100,
  geocodeCronQueueBatchSize: 100,
  geocodeConcurrencyCeiling: 5,
  publishBatchSize: 500,
} as const

export function parseIngestionOrchestrationConfigBatchSizeFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE
  const d = orchestrationDefaultsForMode(bootstrapEnabled).configBatchSize
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.configBatchSize)
}

export function parseIngestionOrchestrationExecutionBudgetMsFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS
  const d = orchestrationDefaultsForMode(bootstrapEnabled).executionBudgetMs
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return d
  if (parsed === 0) return 0
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.executionBudgetMs)
}

export function parseIngestionOrchestrationMinMinutesFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.INGESTION_ORCHESTRATION_MIN_MINUTES
  const d = orchestrationDefaultsForMode(bootstrapEnabled).minIntervalMinutes
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return d
  return Math.min(parsed, 24 * 60)
}

export function parseExternalFetchDomainMinSpacingMsFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.EXTERNAL_FETCH_DOMAIN_MIN_SPACING_MS
  const d = orchestrationDefaultsForMode(bootstrapEnabled).domainSpacingMs
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return d
  const floor = bootstrapEnabled ? 300 : 0
  return Math.max(floor, Math.min(parsed, 60_000))
}

export function parseGeocodeBacklogBatchSizeFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.GEOCODE_BACKLOG_BATCH_SIZE
  const d = orchestrationDefaultsForMode(bootstrapEnabled).geocodeBacklogBatchSize
  const parsed = raw ? Number.parseInt(raw, 10) : d
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.geocodeBacklogBatchSize)
}

export function parseGeocodeCronQueueBatchFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.GEOCODE_CRON_QUEUE_BATCH
  const d = orchestrationDefaultsForMode(bootstrapEnabled).geocodeCronQueueBatchSize
  const parsed = raw ? Number.parseInt(raw, 10) : d
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.geocodeCronQueueBatchSize)
}

export function parseGeocodeConcurrencyCeilingFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.GEOCODE_CONCURRENCY
  const d = orchestrationDefaultsForMode(bootstrapEnabled).geocodeConcurrencyCeiling
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.geocodeConcurrencyCeiling)
}

export function parsePublishBatchSizeFromEnv(bootstrapEnabled = false): number {
  const raw = process.env.INGEST_BATCH_SIZE
  const d = orchestrationDefaultsForMode(bootstrapEnabled).publishBatchSize
  const parsed = raw ? Number.parseInt(raw, 10) : d
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.publishBatchSize)
}
