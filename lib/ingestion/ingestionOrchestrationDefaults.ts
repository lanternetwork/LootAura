/**
 * Canonical ingestion orchestration defaults (must match `app/api/cron/daily/route.ts` parsers).
 * Used for adaptive `normal` profile parity and metrics estimates.
 */

export const INGESTION_ORCHESTRATION_DEFAULTS = {
  configBatchSize: 20,
  executionBudgetMs: 45_000,
  minIntervalMinutes: 10,
  domainSpacingMs: 500,
  geocodeBacklogBatchSize: 25,
  geocodeCronQueueBatchSize: 50,
  geocodeConcurrencyCeiling: 4,
  publishBatchSize: 150,
} as const

export const INGESTION_ORCHESTRATION_HARD_CAPS = {
  configBatchSize: 500,
  executionBudgetMs: 240_000,
  geocodeBacklogBatchSize: 100,
  geocodeCronQueueBatchSize: 100,
  geocodeConcurrencyCeiling: 5,
  publishBatchSize: 500,
} as const

export function parseIngestionOrchestrationConfigBatchSizeFromEnv(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE
  const d = INGESTION_ORCHESTRATION_DEFAULTS.configBatchSize
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.configBatchSize)
}

export function parseIngestionOrchestrationExecutionBudgetMsFromEnv(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS
  const d = INGESTION_ORCHESTRATION_DEFAULTS.executionBudgetMs
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return d
  if (parsed === 0) return 0
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.executionBudgetMs)
}

export function parseIngestionOrchestrationMinMinutesFromEnv(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_MIN_MINUTES
  const d = INGESTION_ORCHESTRATION_DEFAULTS.minIntervalMinutes
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return d
  return Math.min(parsed, 24 * 60)
}

export function parseExternalFetchDomainMinSpacingMsFromEnv(): number {
  const raw = process.env.EXTERNAL_FETCH_DOMAIN_MIN_SPACING_MS
  const d = INGESTION_ORCHESTRATION_DEFAULTS.domainSpacingMs
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return d
  return Math.min(parsed, 60_000)
}

export function parseGeocodeBacklogBatchSizeFromEnv(): number {
  const raw = process.env.GEOCODE_BACKLOG_BATCH_SIZE
  const d = INGESTION_ORCHESTRATION_DEFAULTS.geocodeBacklogBatchSize
  const parsed = raw ? Number.parseInt(raw, 10) : d
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.geocodeBacklogBatchSize)
}

export function parseGeocodeCronQueueBatchFromEnv(): number {
  const raw = process.env.GEOCODE_CRON_QUEUE_BATCH
  const d = INGESTION_ORCHESTRATION_DEFAULTS.geocodeCronQueueBatchSize
  const parsed = raw ? Number.parseInt(raw, 10) : d
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.geocodeCronQueueBatchSize)
}

export function parseGeocodeConcurrencyCeilingFromEnv(): number {
  const raw = process.env.GEOCODE_CONCURRENCY
  const d = INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling
  if (raw === undefined || raw === '') return d
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.geocodeConcurrencyCeiling)
}

export function parsePublishBatchSizeFromEnv(): number {
  const raw = process.env.INGEST_BATCH_SIZE
  const d = INGESTION_ORCHESTRATION_DEFAULTS.publishBatchSize
  const parsed = raw ? Number.parseInt(raw, 10) : d
  if (!Number.isFinite(parsed) || parsed <= 0) return d
  return Math.min(parsed, INGESTION_ORCHESTRATION_HARD_CAPS.publishBatchSize)
}
