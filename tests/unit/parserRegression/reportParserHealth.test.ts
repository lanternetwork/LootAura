import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetParserHealthReporterForTests, reportParserHealthTransition } from '@/lib/parserRegression/reportParserHealth'
import type { ParserDiagnosticsSnapshot } from '@/lib/parserRegression/buildParserDiagnostics'
import type { ParserHealthReason } from '@/lib/parserRegression/parserHealth'
import type { SourceDegradationTag } from '@/lib/parserRegression/sourceDegradation'
import { ObservabilityEvents } from '@/lib/observability/events'

const emitObservabilityRecord = vi.fn()

vi.mock('@/lib/observability/emit', () => ({
  emitObservabilityRecord: (...args: unknown[]) => emitObservabilityRecord(...args),
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

function snap(
  summary: ParserDiagnosticsSnapshot['summary'],
  sources: ParserDiagnosticsSnapshot['sources']
): ParserDiagnosticsSnapshot {
  return {
    summary,
    sources,
    degradedSources: [],
    failingSources: [],
    recommendedAction: 'monitor',
  }
}

describe('reportParserHealthTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetParserHealthReporterForTests()
  })

  it('suppresses repeated identical aggregate snapshots', () => {
    const s = snap(
      { healthy: 2, degraded: 0, failing: 0 },
      [
        {
          sourceHost: 'example.com',
          healthStatus: 'healthy',
          freshnessStatus: 'fresh',
          score: 100,
          healthReasons: [],
          freshnessReasons: [],
          degradationTags: [],
          recommendedAction: 'monitor',
          fixtureTotal: 1,
          staleFixtureCount: 0,
          agingFixtureCount: 0,
          freshFixtureCount: 1,
          fixtureMismatchCount: 0,
          zeroListingCount: 0,
          samples: [],
        },
      ]
    )
    reportParserHealthTransition(s, 1)
    reportParserHealthTransition(s, 2)
    expect(emitObservabilityRecord).not.toHaveBeenCalled()
  })

  it('emits failing once when failing sources appear, then suppresses duplicates', () => {
    const healthy = snap(
      { healthy: 1, degraded: 0, failing: 0 },
      [
        {
          sourceHost: 'example.com',
          healthStatus: 'healthy',
          freshnessStatus: 'fresh',
          score: 100,
          healthReasons: [],
          freshnessReasons: [],
          degradationTags: [],
          recommendedAction: 'monitor',
          fixtureTotal: 1,
          staleFixtureCount: 0,
          agingFixtureCount: 0,
          freshFixtureCount: 1,
          fixtureMismatchCount: 0,
          zeroListingCount: 0,
          samples: [],
        },
      ]
    )
    const bad = snap(
      { healthy: 0, degraded: 0, failing: 1 },
      [
        {
          sourceHost: 'example.com',
          healthStatus: 'failing',
          freshnessStatus: 'fresh',
          score: 10,
          healthReasons: ['high_fixture_mismatch_rate'] as ParserHealthReason[],
          freshnessReasons: [],
          degradationTags: [],
          recommendedAction: 'fix',
          fixtureTotal: 1,
          staleFixtureCount: 0,
          agingFixtureCount: 0,
          freshFixtureCount: 1,
          fixtureMismatchCount: 1,
          zeroListingCount: 0,
          samples: [],
        },
      ]
    )
    reportParserHealthTransition(healthy, 1)
    expect(emitObservabilityRecord).not.toHaveBeenCalled()
    reportParserHealthTransition(bad, 2)
    expect(emitObservabilityRecord).toHaveBeenCalledTimes(1)
    expect(emitObservabilityRecord.mock.calls[0][0]).toEqual(
      expect.objectContaining({ event: ObservabilityEvents.parser.sourceFailing })
    )
    emitObservabilityRecord.mockClear()
    reportParserHealthTransition(bad, 3)
    expect(emitObservabilityRecord).not.toHaveBeenCalled()
  })
})
