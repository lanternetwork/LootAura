/**
 * ES.net ingest orchestration defaults (code-only; no Vercel env vars).
 * Materially slower than YSTM INGESTION_ORCHESTRATION env defaults and the two-minute daily ingest lane.
 */

export const ESNET_INGEST_ORCHESTRATION_DEFAULTS = {
  configBatchSize: 18,
  executionBudgetMs: 90_000,
  minIntervalMinutes: 360,
  domainSpacingMs: 800,
} as const

export const ESNET_INGEST_ORCHESTRATION_BOOTSTRAP_DEFAULTS = {
  configBatchSize: 45,
  executionBudgetMs: 150_000,
  minIntervalMinutes: 120,
  domainSpacingMs: 500,
} as const

export function esnetOrchestrationDefaultsForMode(bootstrapEnabled: boolean) {
  return bootstrapEnabled
    ? ESNET_INGEST_ORCHESTRATION_BOOTSTRAP_DEFAULTS
    : ESNET_INGEST_ORCHESTRATION_DEFAULTS
}

export function parseEsnetIngestConfigBatchSize(bootstrapEnabled: boolean): number {
  return esnetOrchestrationDefaultsForMode(bootstrapEnabled).configBatchSize
}

export function parseEsnetIngestExecutionBudgetMs(bootstrapEnabled: boolean): number {
  return esnetOrchestrationDefaultsForMode(bootstrapEnabled).executionBudgetMs
}

export function parseEsnetIngestMinIntervalMinutes(bootstrapEnabled: boolean): number {
  return esnetOrchestrationDefaultsForMode(bootstrapEnabled).minIntervalMinutes
}

export function parseEsnetIngestDomainSpacingMs(bootstrapEnabled: boolean): number {
  return esnetOrchestrationDefaultsForMode(bootstrapEnabled).domainSpacingMs
}
