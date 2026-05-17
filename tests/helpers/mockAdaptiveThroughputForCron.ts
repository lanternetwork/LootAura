import type { Mock } from 'vitest'
import { buildStaticThroughputEnvelope } from '@/lib/ingestion/adaptiveThroughputConfig'
import type {
  AdaptiveThroughputEnvelope,
  AdaptiveThroughputNoteFields,
} from '@/lib/ingestion/adaptiveThroughputProfile'

export function normalAdaptiveNoteFromEnvelope(
  envelope: AdaptiveThroughputEnvelope
): AdaptiveThroughputNoteFields {
  return {
    adaptiveEnabled: true,
    adaptiveProfile: 'normal',
    profileReason: 'test_mock',
    subsystemProfiles: { fetch: 'normal', geocode: 'normal', publish: 'normal' },
    effectiveConfigBatchSize: envelope.fetch.configBatchSize,
    effectiveExecutionBudgetMs: envelope.fetch.executionBudgetMs,
    effectiveMinIntervalMinutes: envelope.fetch.minIntervalMinutes,
    effectiveDomainSpacingMs: envelope.fetch.domainSpacingMs,
    effectiveGeocodeBacklogBatchSize: envelope.geocode.backlogBatchSize,
    effectiveGeocodeQueueBatchSize: envelope.geocode.queueBatchSize,
    effectiveGeocodeConcurrencyCeiling: envelope.geocode.concurrencyCeiling,
    effectivePublishBatchSize: envelope.publish.batchSize,
    pressureSignals: [],
    dwellRemaining: { fetch: 0, geocode: 0, publish: 0 },
  }
}

export function installAdaptiveThroughputCronMock(
  mockResolve: Mock<() => Promise<{ envelope: AdaptiveThroughputEnvelope; note: AdaptiveThroughputNoteFields }>>
): void {
  mockResolve.mockImplementation(async () => {
    const envelope = buildStaticThroughputEnvelope()
    return {
      envelope,
      note: normalAdaptiveNoteFromEnvelope(envelope),
    }
  })
}
