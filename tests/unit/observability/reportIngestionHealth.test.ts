import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import {
  reportIngestionHealthEvaluation,
  resetIngestionHealthReporterForTests,
} from '@/lib/observability/reportIngestionHealth'

describe('reportIngestionHealthEvaluation', () => {
  beforeEach(() => {
    resetIngestionHealthReporterForTests()
    vi.mocked(Sentry.captureMessage).mockClear()
    vi.mocked(Sentry.captureException).mockClear()
  })

  it('emits once on healthy→degraded and suppresses duplicate fingerprint', () => {
    const now = 1_000_000
    const degraded = { status: 'degraded' as const, reasons: ['queue_pressure' as const] }
    reportIngestionHealthEvaluation(degraded, now)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
    reportIngestionHealthEvaluation(degraded, now + 60_000)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('allows degraded→critical then critical→healthy exactly once each', () => {
    const t = 2_000_000
    reportIngestionHealthEvaluation({ status: 'degraded', reasons: ['queue_pressure'] }, t)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    reportIngestionHealthEvaluation({ status: 'critical', reasons: ['queue_pressure'] }, t + 1)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    reportIngestionHealthEvaluation({ status: 'healthy', reasons: [] }, t + 2)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(2)
  })

  it('bridges healthy→critical via degraded then critical', () => {
    const t = 3_000_000
    reportIngestionHealthEvaluation({ status: 'critical', reasons: ['stale_signal'] }, t)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('does not emit on disallowed critical→degraded', () => {
    const t = 4_000_000
    reportIngestionHealthEvaluation({ status: 'critical', reasons: ['stale_signal'] }, t)
    vi.mocked(Sentry.captureMessage).mockClear()
    vi.mocked(Sentry.captureException).mockClear()
    reportIngestionHealthEvaluation({ status: 'degraded', reasons: ['stale_signal'] }, t + 1)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('does not emit repeated healthy evaluations', () => {
    const t = 5_000_000
    reportIngestionHealthEvaluation({ status: 'healthy', reasons: [] }, t)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    reportIngestionHealthEvaluation({ status: 'healthy', reasons: [] }, t + 1)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })
})
