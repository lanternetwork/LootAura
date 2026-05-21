import { afterEach, describe, expect, it } from 'vitest'
import {
  INGESTION_ORCHESTRATION_DEFAULTS,
  parseGeocodeConcurrencyCeilingFromEnv,
  parseGeocodeCronQueueBatchFromEnv,
  parseIngestionOrchestrationConfigBatchSizeFromEnv,
  parseIngestionOrchestrationExecutionBudgetMsFromEnv,
  parsePublishBatchSizeFromEnv,
} from '@/lib/ingestion/ingestionOrchestrationDefaults'

const ENV_KEYS = [
  'INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE',
  'INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS',
  'GEOCODE_CRON_QUEUE_BATCH',
  'GEOCODE_CONCURRENCY',
  'INGEST_BATCH_SIZE',
] as const

describe('ingestionOrchestrationDefaults', () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = saved[key]
      }
    }
  })

  it('uses Phase 6 burn-in defaults when env is unset', () => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    expect(INGESTION_ORCHESTRATION_DEFAULTS.configBatchSize).toBe(60)
    expect(INGESTION_ORCHESTRATION_DEFAULTS.executionBudgetMs).toBe(120_000)
    expect(INGESTION_ORCHESTRATION_DEFAULTS.geocodeCronQueueBatchSize).toBe(40)
    expect(INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling).toBe(4)
    expect(INGESTION_ORCHESTRATION_DEFAULTS.publishBatchSize).toBe(200)
    expect(parseIngestionOrchestrationConfigBatchSizeFromEnv()).toBe(60)
    expect(parseIngestionOrchestrationExecutionBudgetMsFromEnv()).toBe(120_000)
  })

  it('parses env overrides with hard caps', () => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
    }
    process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE = '999'
    process.env.INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS = '999999'
    process.env.GEOCODE_CRON_QUEUE_BATCH = '999'
    process.env.GEOCODE_CONCURRENCY = '99'
    process.env.INGEST_BATCH_SIZE = '999'
    expect(parseIngestionOrchestrationConfigBatchSizeFromEnv()).toBe(500)
    expect(parseIngestionOrchestrationExecutionBudgetMsFromEnv()).toBe(240_000)
    expect(parseGeocodeCronQueueBatchFromEnv()).toBe(100)
    expect(parseGeocodeConcurrencyCeilingFromEnv()).toBe(5)
    expect(parsePublishBatchSizeFromEnv()).toBe(500)
  })
})
