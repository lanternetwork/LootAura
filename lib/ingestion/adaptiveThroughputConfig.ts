import {
  INGESTION_ORCHESTRATION_DEFAULTS,
  INGESTION_ORCHESTRATION_HARD_CAPS,
  parseExternalFetchDomainMinSpacingMsFromEnv,
  parseGeocodeBacklogBatchSizeFromEnv,
  parseGeocodeConcurrencyCeilingFromEnv,
  parseGeocodeCronQueueBatchFromEnv,
  parseIngestionOrchestrationConfigBatchSizeFromEnv,
  parseIngestionOrchestrationExecutionBudgetMsFromEnv,
  parseIngestionOrchestrationMinMinutesFromEnv,
  parsePublishBatchSizeFromEnv,
} from '@/lib/ingestion/ingestionOrchestrationDefaults'

export type AdaptiveSubsystem = 'fetch' | 'geocode' | 'publish'
export type AdaptiveSubsystemProfile = 'conservative' | 'normal' | 'elevated' | 'recovery'

export const ADAPTIVE_METRICS_STALE_MS = 15 * 60 * 1000

export type AdaptiveCaps = {
  maxConfigBatch: number
  maxExecutionBudgetMs: number
  minDomainSpacingMs: number
  maxGeocodeBacklogBatch: number
  maxGeocodeQueueBatch: number
  maxGeocodeConcurrency: number
  maxPublishBatch: number
  recoveryDwellRuns: number
  elevatedDwellRuns: number
}

export function isAdaptiveThroughputEnabled(): boolean {
  const raw = process.env.INGESTION_ADAPTIVE_ENABLED
  if (raw === undefined || raw === '') return true
  const v = raw.trim().toLowerCase()
  return v !== 'false' && v !== '0' && v !== 'no'
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export function loadAdaptiveCaps(): AdaptiveCaps {
  const d = INGESTION_ORCHESTRATION_DEFAULTS
  return {
    maxConfigBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_CONFIG_BATCH,
      60,
      INGESTION_ORCHESTRATION_HARD_CAPS.configBatchSize
    ),
    maxExecutionBudgetMs: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_EXECUTION_BUDGET_MS,
      120_000,
      INGESTION_ORCHESTRATION_HARD_CAPS.executionBudgetMs
    ),
    minDomainSpacingMs: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MIN_DOMAIN_SPACING_MS,
      400,
      d.domainSpacingMs
    ),
    maxGeocodeBacklogBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_GEOCODE_BATCH,
      50,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeBacklogBatchSize
    ),
    maxGeocodeQueueBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_GEOCODE_BATCH,
      50,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeCronQueueBatchSize
    ),
    maxGeocodeConcurrency: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_GEOCODE_CONCURRENCY,
      5,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeConcurrencyCeiling
    ),
    maxPublishBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_PUBLISH_BATCH,
      200,
      INGESTION_ORCHESTRATION_HARD_CAPS.publishBatchSize
    ),
    recoveryDwellRuns: parsePositiveIntEnv(process.env.INGESTION_ADAPTIVE_RECOVERY_DWELL_RUNS, 3, 24),
    elevatedDwellRuns: parsePositiveIntEnv(process.env.INGESTION_ADAPTIVE_ELEVATED_DWELL_RUNS, 2, 24),
  }
}

/** Static envelope when adaptive is disabled — env overrides preserved, profile always normal. */
export function buildStaticThroughputEnvelope() {
  return {
    fetch: {
      configBatchSize: parseIngestionOrchestrationConfigBatchSizeFromEnv(),
      executionBudgetMs: parseIngestionOrchestrationExecutionBudgetMsFromEnv(),
      minIntervalMinutes: parseIngestionOrchestrationMinMinutesFromEnv(),
      domainSpacingMs: parseExternalFetchDomainMinSpacingMsFromEnv(),
    },
    geocode: {
      backlogBatchSize: parseGeocodeBacklogBatchSizeFromEnv(),
      queueBatchSize: parseGeocodeCronQueueBatchFromEnv(),
      concurrencyCeiling: parseGeocodeConcurrencyCeilingFromEnv(),
    },
    publish: {
      batchSize: parsePublishBatchSizeFromEnv(),
    },
  }
}

export type FetchKnobProfile = {
  configBatchSize: number
  executionBudgetMs: number
  minIntervalMinutes: number
  domainSpacingMs: number
}

export type GeocodeKnobProfile = {
  backlogBatchSize: number
  queueBatchSize: number
  concurrencyCeiling: number
}

export type PublishKnobProfile = {
  batchSize: number
}

const CONSERVATIVE_FETCH: FetchKnobProfile = {
  configBatchSize: 12,
  executionBudgetMs: 30_000,
  minIntervalMinutes: 15,
  domainSpacingMs: 875,
}

const NORMAL_FETCH: FetchKnobProfile = {
  configBatchSize: INGESTION_ORCHESTRATION_DEFAULTS.configBatchSize,
  executionBudgetMs: INGESTION_ORCHESTRATION_DEFAULTS.executionBudgetMs,
  minIntervalMinutes: INGESTION_ORCHESTRATION_DEFAULTS.minIntervalMinutes,
  domainSpacingMs: INGESTION_ORCHESTRATION_DEFAULTS.domainSpacingMs,
}

const ELEVATED_FETCH_BASE: FetchKnobProfile = {
  configBatchSize: 32,
  executionBudgetMs: 90_000,
  minIntervalMinutes: 7,
  domainSpacingMs: 400,
}

const RECOVERY_FETCH: FetchKnobProfile = {
  configBatchSize: 15,
  executionBudgetMs: 35_000,
  minIntervalMinutes: 15,
  domainSpacingMs: INGESTION_ORCHESTRATION_DEFAULTS.domainSpacingMs,
}

const CONSERVATIVE_GEOCODE: GeocodeKnobProfile = {
  backlogBatchSize: 15,
  queueBatchSize: 25,
  concurrencyCeiling: 2,
}

const NORMAL_GEOCODE: GeocodeKnobProfile = {
  backlogBatchSize: INGESTION_ORCHESTRATION_DEFAULTS.geocodeBacklogBatchSize,
  queueBatchSize: INGESTION_ORCHESTRATION_DEFAULTS.geocodeCronQueueBatchSize,
  concurrencyCeiling: INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling,
}

const ELEVATED_GEOCODE_BASE: GeocodeKnobProfile = {
  backlogBatchSize: 55,
  queueBatchSize: 75,
  concurrencyCeiling: 5,
}

const RECOVERY_GEOCODE: GeocodeKnobProfile = {
  backlogBatchSize: 20,
  queueBatchSize: 40,
  concurrencyCeiling: 2,
}

const CONSERVATIVE_PUBLISH: PublishKnobProfile = { batchSize: 100 }
const NORMAL_PUBLISH: PublishKnobProfile = { batchSize: INGESTION_ORCHESTRATION_DEFAULTS.publishBatchSize }
const ELEVATED_PUBLISH_BASE: PublishKnobProfile = { batchSize: 225 }
const RECOVERY_PUBLISH: PublishKnobProfile = { batchSize: 125 }

function clampFetch(profile: FetchKnobProfile, caps: AdaptiveCaps): FetchKnobProfile {
  return {
    configBatchSize: Math.min(profile.configBatchSize, caps.maxConfigBatch),
    executionBudgetMs: Math.min(profile.executionBudgetMs, caps.maxExecutionBudgetMs),
    minIntervalMinutes: Math.max(5, Math.min(profile.minIntervalMinutes, 24 * 60)),
    domainSpacingMs: Math.max(caps.minDomainSpacingMs, profile.domainSpacingMs),
  }
}

function clampGeocode(profile: GeocodeKnobProfile, caps: AdaptiveCaps): GeocodeKnobProfile {
  return {
    backlogBatchSize: Math.min(
      profile.backlogBatchSize,
      caps.maxGeocodeBacklogBatch,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeBacklogBatchSize
    ),
    queueBatchSize: Math.min(
      profile.queueBatchSize,
      caps.maxGeocodeQueueBatch,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeCronQueueBatchSize
    ),
    concurrencyCeiling: Math.min(
      profile.concurrencyCeiling,
      caps.maxGeocodeConcurrency,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeConcurrencyCeiling
    ),
  }
}

function clampPublish(profile: PublishKnobProfile, caps: AdaptiveCaps): PublishKnobProfile {
  return {
    batchSize: Math.min(profile.batchSize, caps.maxPublishBatch, INGESTION_ORCHESTRATION_HARD_CAPS.publishBatchSize),
  }
}

export function knobsForSubsystemProfile(
  subsystem: AdaptiveSubsystem,
  profile: AdaptiveSubsystemProfile,
  caps: AdaptiveCaps
): FetchKnobProfile | GeocodeKnobProfile | PublishKnobProfile {
  if (subsystem === 'fetch') {
    const base =
      profile === 'conservative'
        ? CONSERVATIVE_FETCH
        : profile === 'elevated'
          ? ELEVATED_FETCH_BASE
          : profile === 'recovery'
            ? RECOVERY_FETCH
            : NORMAL_FETCH
    return clampFetch(base, caps)
  }
  if (subsystem === 'geocode') {
    const base =
      profile === 'conservative'
        ? CONSERVATIVE_GEOCODE
        : profile === 'elevated'
          ? ELEVATED_GEOCODE_BASE
          : profile === 'recovery'
            ? RECOVERY_GEOCODE
            : NORMAL_GEOCODE
    return clampGeocode(base, caps)
  }
  const base =
    profile === 'conservative'
      ? CONSERVATIVE_PUBLISH
      : profile === 'elevated'
        ? ELEVATED_PUBLISH_BASE
        : profile === 'recovery'
          ? RECOVERY_PUBLISH
          : NORMAL_PUBLISH
  return clampPublish(base, caps)
}
