import { describe, it, expect } from 'vitest'
import {
  evaluateIngestionHealth,
  defaultIngestionHealthThresholds,
  type IngestionHealthSignals,
  type IngestionHealthThresholds,
} from '@/lib/observability/ingestionHealth'

const baseThresholds = (): IngestionHealthThresholds => ({
  ...defaultIngestionHealthThresholds(),
  requiredSignals: ['queueDepth'],
})

describe('evaluateIngestionHealth', () => {
  it('returns healthy when signals are nominal', () => {
    const t0 = Date.parse('2026-01-15T12:00:00.000Z')
    const signals: IngestionHealthSignals = {
      evaluatedAtIso: '2026-01-15T12:00:00.000Z',
      queueDepth: 0,
    }
    const out = evaluateIngestionHealth(signals, baseThresholds(), t0)
    expect(out.status).toBe('healthy')
    expect(out.reasons).toEqual([])
  })

  it('floors to degraded when a required signal is missing', () => {
    const now = Date.parse('2026-01-15T12:00:05.000Z')
    const signals: IngestionHealthSignals = {
      evaluatedAtIso: '2026-01-15T12:00:00.000Z',
    }
    const out = evaluateIngestionHealth(signals, baseThresholds(), now)
    expect(out.status).toBe('degraded')
    expect(out.reasons).toContain('missing_signal')
  })

  it('marks critical when snapshot is stale beyond threshold', () => {
    const now = Date.parse('2026-01-15T12:10:00.000Z')
    const signals: IngestionHealthSignals = {
      evaluatedAtIso: '2026-01-15T12:00:00.000Z',
      queueDepth: 0,
    }
    const thresholds = { ...baseThresholds(), snapshotStaleCriticalMs: 120_000 }
    const out = evaluateIngestionHealth(signals, thresholds, now)
    expect(out.status).toBe('critical')
    expect(out.reasons).toContain('stale_signal')
  })

  it('uses highest severity when signals disagree', () => {
    const t0 = Date.parse('2026-01-15T12:00:00.000Z')
    const signals: IngestionHealthSignals = {
      evaluatedAtIso: '2026-01-15T12:00:00.000Z',
      queueDepth: 0,
      starvationDetected: true,
      staleBacklogAgeMs: 3 * 60 * 60 * 1000,
    }
    const thresholds = baseThresholds()
    const out = evaluateIngestionHealth(signals, thresholds, t0)
    expect(out.status).toBe('critical')
    expect(out.reasons).toContain('starvation_detected')
    expect(out.reasons).toContain('queue_pressure')
  })

  it('classifies archive pending and lease contention', () => {
    const t0 = Date.parse('2026-01-15T12:00:00.000Z')
    const signals: IngestionHealthSignals = {
      evaluatedAtIso: '2026-01-15T12:00:00.000Z',
      queueDepth: 1,
      archivePendingCount: 300,
      leaseConflictCount: 25,
    }
    const out = evaluateIngestionHealth(signals, baseThresholds(), t0)
    expect(out.status).toBe('critical')
    expect(out.reasons).toContain('archive_lag')
    expect(out.reasons).toContain('lease_contention')
  })
})
