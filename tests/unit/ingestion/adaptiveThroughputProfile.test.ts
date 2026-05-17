import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { INGESTION_ORCHESTRATION_DEFAULTS } from '@/lib/ingestion/ingestionOrchestrationDefaults'
import {
  resolveAdaptiveThroughput,
  type AdaptiveDwellState,
  type AdaptivePressureSignals,
} from '@/lib/ingestion/adaptiveThroughputProfile'
import { isAdaptiveThroughputEnabled, type AdaptiveCaps } from '@/lib/ingestion/adaptiveThroughputConfig'

const testCaps: AdaptiveCaps = {
  maxConfigBatch: 40,
  maxExecutionBudgetMs: 120_000,
  minDomainSpacingMs: 400,
  maxGeocodeBacklogBatch: 50,
  maxGeocodeQueueBatch: 50,
  maxGeocodeConcurrency: 5,
  maxPublishBatch: 200,
  recoveryDwellRuns: 3,
  elevatedDwellRuns: 2,
}

function healthySignals(overrides: Partial<AdaptivePressureSignals> = {}): AdaptivePressureSignals {
  return {
    metricsAvailable: true,
    metricsStale: false,
    needsGeocodeCount: 0,
    oldestNeedsGeocodeAgeMs: null,
    readyCount: 0,
    oldestReadyAgeMs: null,
    crawlableConfigsTotal: 100,
    configsDueForCrawl: 5,
    configsOverdue: 0,
    fetchFailureRate24h: 0,
    fetchBudgetExitCount24h: 0,
    rate429Count24h: 0,
    geocodeRetryableFailed24h: 0,
    geocodeTerminalFailed24h: 0,
    publishFailed24h: 0,
    publishAttempted24h: 0,
    recentOrchestrationDurationMsAvg: 30_000,
    recentFetchBudgetExitRuns: 0,
    recentOrchestrationErrorRuns: 0,
    fetchHealthyForElevation: true,
    ...overrides,
  }
}

const normalDwell: AdaptiveDwellState = {
  subsystemProfiles: { fetch: 'normal', geocode: 'normal', publish: 'normal' },
  dwellRemaining: { fetch: 0, geocode: 0, publish: 0 },
  aggregateProfile: 'normal',
}

describe('adaptiveThroughputProfile', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    process.env.INGESTION_ADAPTIVE_ENABLED = 'true'
  })

  afterEach(() => {
    process.env = { ...envBackup }
  })

  it('adaptive disabled preserves static env-driven normal knobs', () => {
    process.env.INGESTION_ADAPTIVE_ENABLED = 'false'
    process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE = '22'
    const { envelope, note } = resolveAdaptiveThroughput({
      signals: healthySignals(),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.adaptiveEnabled).toBe(false)
    expect(envelope.fetch.configBatchSize).toBe(22)
    expect(note.adaptiveProfile).toBe('normal')
  })

  it('normal profile matches canonical defaults when healthy', () => {
    const { envelope, note } = resolveAdaptiveThroughput({
      signals: healthySignals(),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles).toEqual({ fetch: 'normal', geocode: 'normal', publish: 'normal' })
    expect(envelope.fetch.configBatchSize).toBe(INGESTION_ORCHESTRATION_DEFAULTS.configBatchSize)
    expect(envelope.fetch.executionBudgetMs).toBe(INGESTION_ORCHESTRATION_DEFAULTS.executionBudgetMs)
    expect(envelope.fetch.minIntervalMinutes).toBe(INGESTION_ORCHESTRATION_DEFAULTS.minIntervalMinutes)
    expect(envelope.fetch.domainSpacingMs).toBe(INGESTION_ORCHESTRATION_DEFAULTS.domainSpacingMs)
    expect(envelope.geocode.backlogBatchSize).toBe(INGESTION_ORCHESTRATION_DEFAULTS.geocodeBacklogBatchSize)
    expect(envelope.geocode.concurrencyCeiling).toBe(INGESTION_ORCHESTRATION_DEFAULTS.geocodeConcurrencyCeiling)
    expect(envelope.publish.batchSize).toBe(INGESTION_ORCHESTRATION_DEFAULTS.publishBatchSize)
  })

  it('missing metrics fail closed to conservative', () => {
    const { envelope, note } = resolveAdaptiveThroughput({
      signals: healthySignals({ metricsAvailable: false, metricsStale: true }),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.fetch).toBe('conservative')
    expect(note.subsystemProfiles.geocode).toBe('conservative')
    expect(note.subsystemProfiles.publish).toBe('conservative')
    expect(envelope.fetch.configBatchSize).toBeLessThan(INGESTION_ORCHESTRATION_DEFAULTS.configBatchSize)
    expect(envelope.geocode.concurrencyCeiling).toBeLessThanOrEqual(3)
  })

  it('high geocode backlog elevates geocode only', () => {
    const { envelope, note } = resolveAdaptiveThroughput({
      signals: healthySignals({
        needsGeocodeCount: 80,
        oldestNeedsGeocodeAgeMs: 90 * 60 * 1000,
      }),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.geocode).toBe('elevated')
    expect(note.subsystemProfiles.fetch).toBe('normal')
    expect(note.subsystemProfiles.publish).toBe('normal')
    expect(envelope.geocode.backlogBatchSize).toBeGreaterThan(
      INGESTION_ORCHESTRATION_DEFAULTS.geocodeBacklogBatchSize
    )
  })

  it('publish backlog elevates publish only when geocode healthy', () => {
    const { envelope, note } = resolveAdaptiveThroughput({
      signals: healthySignals({
        readyCount: 40,
        oldestReadyAgeMs: 45 * 60 * 1000,
      }),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.publish).toBe('elevated')
    expect(note.subsystemProfiles.fetch).toBe('normal')
    expect(envelope.publish.batchSize).toBeGreaterThan(INGESTION_ORCHESTRATION_DEFAULTS.publishBatchSize)
  })

  it('provider 429 forces recovery on fetch and geocode', () => {
    const { note } = resolveAdaptiveThroughput({
      signals: healthySignals({ rate429Count24h: 12 }),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.fetch).toBe('recovery')
    expect(note.subsystemProfiles.geocode).toBe('recovery')
    expect(note.backoffReason).toBeTruthy()
  })

  it('budget exit streak forces fetch recovery', () => {
    const { note } = resolveAdaptiveThroughput({
      signals: healthySignals({
        fetchBudgetExitCount24h: 4,
        recentFetchBudgetExitRuns: 2,
      }),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.fetch).toBe('recovery')
  })

  it('due/overdue alone does not elevate fetch without overdue', () => {
    const { note } = resolveAdaptiveThroughput({
      signals: healthySignals({
        configsDueForCrawl: 20,
        configsOverdue: 0,
        fetchHealthyForElevation: true,
      }),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.fetch).toBe('normal')
  })

  it('overdue with healthy signals elevates fetch', () => {
    const { note } = resolveAdaptiveThroughput({
      signals: healthySignals({
        configsOverdue: 10,
        fetchHealthyForElevation: true,
      }),
      previousDwell: normalDwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.fetch).toBe('elevated')
  })

  it('recovery dwell prevents immediate exit from recovery', () => {
    const dwell: AdaptiveDwellState = {
      subsystemProfiles: { fetch: 'recovery', geocode: 'normal', publish: 'normal' },
      dwellRemaining: { fetch: 2, geocode: 0, publish: 0 },
      aggregateProfile: 'recovery',
    }
    const { note } = resolveAdaptiveThroughput({
      signals: healthySignals(),
      previousDwell: dwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.fetch).toBe('recovery')
    expect(note.dwellRemaining?.fetch).toBe(1)
  })

  it('gradual step-up prevents conservative to elevated jump', () => {
    const dwell: AdaptiveDwellState = {
      subsystemProfiles: { fetch: 'conservative', geocode: 'conservative', publish: 'conservative' },
      dwellRemaining: { fetch: 0, geocode: 0, publish: 0 },
      aggregateProfile: 'conservative',
    }
    const { note } = resolveAdaptiveThroughput({
      signals: healthySignals({
        configsOverdue: 20,
        needsGeocodeCount: 80,
        oldestNeedsGeocodeAgeMs: 90 * 60 * 1000,
        readyCount: 40,
        oldestReadyAgeMs: 45 * 60 * 1000,
      }),
      previousDwell: dwell,
      caps: testCaps,
    })
    expect(note.subsystemProfiles.fetch).not.toBe('elevated')
    expect(['normal', 'conservative']).toContain(note.subsystemProfiles.fetch)
  })

  it('enforces hard caps on elevated knobs', () => {
    const tightCaps: AdaptiveCaps = {
      ...testCaps,
      maxConfigBatch: 25,
      maxGeocodeBacklogBatch: 30,
      maxPublishBatch: 160,
    }
    const { envelope } = resolveAdaptiveThroughput({
      signals: healthySignals({
        configsOverdue: 50,
        needsGeocodeCount: 200,
        oldestNeedsGeocodeAgeMs: 3 * 60 * 60 * 1000,
        readyCount: 100,
        oldestReadyAgeMs: 2 * 60 * 60 * 1000,
      }),
      previousDwell: {
        subsystemProfiles: { fetch: 'normal', geocode: 'normal', publish: 'normal' },
        dwellRemaining: { fetch: 0, geocode: 0, publish: 0 },
        aggregateProfile: 'normal',
      },
      caps: tightCaps,
    })
    expect(envelope.fetch.configBatchSize).toBeLessThanOrEqual(25)
    expect(envelope.geocode.backlogBatchSize).toBeLessThanOrEqual(30)
    expect(envelope.publish.batchSize).toBeLessThanOrEqual(160)
  })

  it('isAdaptiveThroughputEnabled defaults true', () => {
    delete process.env.INGESTION_ADAPTIVE_ENABLED
    expect(isAdaptiveThroughputEnabled()).toBe(true)
  })
})
