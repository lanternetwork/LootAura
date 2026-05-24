import {
  INGESTION_ORCHESTRATION_BOOTSTRAP_DEFAULTS,
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

export function loadAdaptiveCaps(options?: { bootstrapNationwide?: boolean }): AdaptiveCaps {
  const bootstrap = options?.bootstrapNationwide === true
  const d = bootstrap ? INGESTION_ORCHESTRATION_BOOTSTRAP_DEFAULTS : INGESTION_ORCHESTRATION_DEFAULTS
  return {
    maxConfigBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_CONFIG_BATCH,
      d.configBatchSize,
      INGESTION_ORCHESTRATION_HARD_CAPS.configBatchSize
    ),
    maxExecutionBudgetMs: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_EXECUTION_BUDGET_MS,
      d.executionBudgetMs,
      INGESTION_ORCHESTRATION_HARD_CAPS.executionBudgetMs
    ),
    minDomainSpacingMs: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MIN_DOMAIN_SPACING_MS,
      bootstrap ? 300 : 400,
      d.domainSpacingMs
    ),
    maxGeocodeBacklogBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_GEOCODE_BATCH,
      d.geocodeBacklogBatchSize,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeBacklogBatchSize
    ),
    maxGeocodeQueueBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_GEOCODE_BATCH,
      d.geocodeCronQueueBatchSize,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeCronQueueBatchSize
    ),
    maxGeocodeConcurrency: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_GEOCODE_CONCURRENCY,
      5,
      INGESTION_ORCHESTRATION_HARD_CAPS.geocodeConcurrencyCeiling
    ),
    maxPublishBatch: parsePositiveIntEnv(
      process.env.INGESTION_ADAPTIVE_MAX_PUBLISH_BATCH,
      d.publishBatchSize,
      INGESTION_ORCHESTRATION_HARD_CAPS.publishBatchSize
    ),
    recoveryDwellRuns: parsePositiveIntEnv(process.env.INGESTION_ADAPTIVE_RECOVERY_DWELL_RUNS, 3, 24),
    elevatedDwellRuns: parsePositiveIntEnv(process.env.INGESTION_ADAPTIVE_ELEVATED_DWELL_RUNS, 2, 24),
  }
}

/** Static envelope when adaptive is disabled — env overrides preserved, profile always normal. */
export function buildStaticThroughputEnvelope(bootstrapEnabled = false) {
  return {
    fetch: {
      configBatchSize: parseIngestionOrchestrationConfigBatchSizeFromEnv(bootstrapEnabled),
      executionBudgetMs: parseIngestionOrchestrationExecutionBudgetMsFromEnv(bootstrapEnabled),
      minIntervalMinutes: parseIngestionOrchestrationMinMinutesFromEnv(bootstrapEnabled),
      domainSpacingMs: parseExternalFetchDomainMinSpacingMsFromEnv(bootstrapEnabled),
    },
    geocode: {
      backlogBatchSize: parseGeocodeBacklogBatchSizeFromEnv(bootstrapEnabled),
      queueBatchSize: parseGeocodeCronQueueBatchFromEnv(bootstrapEnabled),
      concurrencyCeiling: parseGeocodeConcurrencyCeilingFromEnv(bootstrapEnabled),
    },
    publish: {
      batchSize: parsePublishBatchSizeFromEnv(bootstrapEnabled),
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

function normalFetchProfile(bootstrapNationwide: boolean): FetchKnobProfile {
  const d = bootstrapNationwide ? INGESTION_ORCHESTRATION_BOOTSTRAP_DEFAULTS : INGESTION_ORCHESTRATION_DEFAULTS
  return {
    configBatchSize: d.configBatchSize,
    executionBudgetMs: d.executionBudgetMs,
    minIntervalMinutes: d.minIntervalMinutes,
    domainSpacingMs: d.domainSpacingMs,
  }
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

function normalGeocodeProfile(bootstrapNationwide: boolean): GeocodeKnobProfile {
  const d = bootstrapNationwide ? INGESTION_ORCHESTRATION_BOOTSTRAP_DEFAULTS : INGESTION_ORCHESTRATION_DEFAULTS
  return {
    backlogBatchSize: d.geocodeBacklogBatchSize,
    queueBatchSize: d.geocodeCronQueueBatchSize,
    concurrencyCeiling: d.geocodeConcurrencyCeiling,
  }
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
function normalPublishProfile(bootstrapNationwide: boolean): PublishKnobProfile {
  const d = bootstrapNationwide ? INGESTION_ORCHESTRATION_BOOTSTRAP_DEFAULTS : INGESTION_ORCHESTRATION_DEFAULTS
  return { batchSize: d.publishBatchSize }
}
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
  caps: AdaptiveCaps,
  options?: { bootstrapNationwide?: boolean }
): FetchKnobProfile | GeocodeKnobProfile | PublishKnobProfile {
  const bootstrap = options?.bootstrapNationwide === true
  if (subsystem === 'fetch') {
    const base =
      profile === 'conservative'
        ? CONSERVATIVE_FETCH
        : profile === 'elevated'
          ? ELEVATED_FETCH_BASE
          : profile === 'recovery'
            ? RECOVERY_FETCH
            : normalFetchProfile(bootstrap)
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
            : normalGeocodeProfile(bootstrap)
    return clampGeocode(base, caps)
  }
  const base =
    profile === 'conservative'
      ? CONSERVATIVE_PUBLISH
      : profile === 'elevated'
        ? ELEVATED_PUBLISH_BASE
        : profile === 'recovery'
          ? RECOVERY_PUBLISH
          : normalPublishProfile(bootstrap)
  return clampPublish(base, caps)
}
