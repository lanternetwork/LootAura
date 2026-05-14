import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObservabilityEvents } from '@/lib/observability/events'
import {
  parserHealthTransitionFingerprint,
  reportParserHealthTransitions,
  resetParserHealthReporterForTests,
} from '@/lib/parserRegression/reportParserHealth'

const emitObservabilityRecord = vi.fn()

vi.mock('@/lib/observability/emit', () => ({
  emitObservabilityRecord: (...a: unknown[]) => emitObservabilityRecord(...a),
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'

const host = 'example.com'

function snap(
  combined: 'healthy' | 'degraded' | 'failing',
  fresh: 'fresh' | 'aging' | 'stale',
  reasons: readonly string[] = []
) {
  return [{ sourceHost: host, combinedHealth: combined, fixtureFreshness: fresh, reasons }]
}

describe('parserHealthTransitionFingerprint', () => {
  it('is deterministic for reason order', () => {
    const a = parserHealthTransitionFingerprint(host, 'degraded', 'fresh', ['z', 'a'])
    const b = parserHealthTransitionFingerprint(host, 'degraded', 'fresh', ['a', 'z'])
    expect(a).toBe(b)
  })
})

describe('reportParserHealthTransitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetParserHealthReporterForTests()
  })

  it('suppresses repeated identical snapshots (fingerprint dedupe)', () => {
    const s = snap('degraded', 'fresh', ['high_zero_listing_rate'])
    reportParserHealthTransitions(s, 1, { reportToSentry: false })
    const n = emitObservabilityRecord.mock.calls.length
    reportParserHealthTransitions(
      [{ sourceHost: host, combinedHealth: 'degraded', fixtureFreshness: 'fresh', reasons: ['z', 'a'] }],
      2,
      { reportToSentry: false }
    )
    expect(emitObservabilityRecord.mock.calls.length).toBe(n)
  })

  it('emits degraded once on healthy -> degraded', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('degraded', 'fresh', ['r1']), 2, { reportToSentry: false })
    expect(emitObservabilityRecord.mock.calls.filter((c) => c[0].event === ObservabilityEvents.parser.sourceDegraded))
      .toHaveLength(1)
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('degraded', 'fresh', ['r1']), 3, { reportToSentry: false })
    expect(emitObservabilityRecord).not.toHaveBeenCalled()
  })

  it('emits failing once when entering failing from degraded', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    reportParserHealthTransitions(snap('degraded', 'fresh', ['x']), 2, { reportToSentry: false })
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('failing', 'fresh', ['x']), 3, { reportToSentry: false })
    expect(emitObservabilityRecord.mock.calls.filter((c) => c[0].event === ObservabilityEvents.parser.sourceFailing))
      .toHaveLength(1)
  })

  it('emits failing once on direct healthy -> failing', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('failing', 'fresh', ['invalid_metrics']), 2, { reportToSentry: false })
    expect(emitObservabilityRecord.mock.calls.filter((c) => c[0].event === ObservabilityEvents.parser.sourceFailing))
      .toHaveLength(1)
    expect(
      emitObservabilityRecord.mock.calls.filter((c) => c[0].event === ObservabilityEvents.parser.sourceDegraded)
    ).toHaveLength(0)
  })

  it('emits recovery once from failing -> healthy', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    reportParserHealthTransitions(snap('failing', 'fresh', ['bad']), 2, { reportToSentry: false })
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('healthy', 'fresh', []), 3, { reportToSentry: false })
    expect(
      emitObservabilityRecord.mock.calls.filter((c) => c[0].event === ObservabilityEvents.parser.sourceRecovered)
    ).toHaveLength(1)
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('healthy', 'fresh', []), 4, { reportToSentry: false })
    expect(emitObservabilityRecord).not.toHaveBeenCalled()
  })

  it('emits recovery once from degraded -> healthy', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    reportParserHealthTransitions(snap('degraded', 'fresh', ['d']), 2, { reportToSentry: false })
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('healthy', 'fresh', []), 3, { reportToSentry: false })
    expect(
      emitObservabilityRecord.mock.calls.filter((c) => c[0].event === ObservabilityEvents.parser.sourceRecovered)
    ).toHaveLength(1)
  })

  it('emits fixture stale on transition into stale', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    emitObservabilityRecord.mockClear()
    reportParserHealthTransitions(snap('healthy', 'stale'), 2, { reportToSentry: false })
    expect(emitObservabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({ event: ObservabilityEvents.parser.fixtureStale })
    )
  })

  it('telemetry payloads use hash only (no raw URLs or HTML)', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    reportParserHealthTransitions(snap('degraded', 'fresh', ['x']), 2, { reportToSentry: false })
    const degradedCall = emitObservabilityRecord.mock.calls.find(
      (c) => (c[0] as { event: string }).event === ObservabilityEvents.parser.sourceDegraded
    )
    expect(degradedCall).toBeDefined()
    const payload = JSON.stringify(degradedCall![0])
    expect(payload).not.toMatch(/https?:\/\//i)
    expect(payload).not.toMatch(/<html/i)
    expect(payload).toMatch(/pageHostHash/)
  })

  it('does not emit cold-start healthy+fresh', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    expect(emitObservabilityRecord).not.toHaveBeenCalled()
  })

  it('does not call Sentry when reportToSentry is false', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    reportParserHealthTransitions(snap('degraded', 'fresh', ['a']), 2, { reportToSentry: false })
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('uses captureMessage for degraded and captureException for failing when reportToSentry is true', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: true })
    reportParserHealthTransitions(snap('degraded', 'fresh', ['a']), 2, { reportToSentry: true })
    expect(Sentry.captureMessage).toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    vi.mocked(Sentry.captureMessage).mockClear()
    reportParserHealthTransitions(snap('failing', 'fresh', ['a']), 3, { reportToSentry: true })
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('recovery uses captureMessage info only (no exception)', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: true })
    reportParserHealthTransitions(snap('failing', 'fresh', ['a']), 2, { reportToSentry: true })
    vi.mocked(Sentry.captureException).mockClear()
    vi.mocked(Sentry.captureMessage).mockClear()
    reportParserHealthTransitions(snap('healthy', 'fresh'), 3, { reportToSentry: true })
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('resetParserHealthReporterForTests clears dedupe state', () => {
    reportParserHealthTransitions(snap('healthy', 'fresh'), 1, { reportToSentry: false })
    reportParserHealthTransitions(snap('degraded', 'fresh', ['r']), 2, { reportToSentry: false })
    const afterFirst = emitObservabilityRecord.mock.calls.length
    resetParserHealthReporterForTests()
    reportParserHealthTransitions(snap('healthy', 'fresh'), 3, { reportToSentry: false })
    reportParserHealthTransitions(snap('degraded', 'fresh', ['r']), 4, { reportToSentry: false })
    expect(emitObservabilityRecord.mock.calls.length).toBeGreaterThan(afterFirst)
  })

  it('skips internal aggregate hosts starting with underscore', () => {
    reportParserHealthTransitions(
      [{ sourceHost: '__invalid__', combinedHealth: 'failing', fixtureFreshness: 'fresh', reasons: [] }],
      1,
      { reportToSentry: false }
    )
    expect(emitObservabilityRecord).not.toHaveBeenCalled()
  })
})
