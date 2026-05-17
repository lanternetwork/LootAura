import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MAX_GEOCODE_DEAD_LETTER_REPLAYS,
  GEOCODE_DEAD_LETTER_SCHEMA_VERSION,
} from '@/lib/geocode/deadLetter'
import {
  evaluateGeocodeDeadLetterReplayEligibility,
  runBoundedGeocodeDeadLetterReplay,
} from '@/lib/geocode/geocodeDeadLetterReplay'
import { ObservabilityEvents } from '@/lib/observability/events'

const mockFromBase = vi.fn()
const emitObservabilityRecord = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/observability/emit', () => ({
  emitObservabilityRecord: (...args: unknown[]) => emitObservabilityRecord(...args),
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
}))

const baseDl = {
  schema_version: GEOCODE_DEAD_LETTER_SCHEMA_VERSION,
  disposition: 'retryable' as const,
  classification_count: 2,
  classified_at_ms: 1_000_000,
  replay_cooldown_ms: 60_000,
  eligible_replay: true,
  reasons: ['transient_provider'],
}

describe('evaluateGeocodeDeadLetterReplayEligibility', () => {
  const now = 2_000_000
  const max = DEFAULT_MAX_GEOCODE_DEAD_LETTER_REPLAYS

  it('rejects wrong status', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_geocode',
        failureDetails: { geocode_dead_letter: baseDl },
        nowMs: now,
        maxReplayAttempts: max,
      })
    ).toEqual({ ok: false, reason: 'wrong_status' })
  })

  it('skips permanent_terminal', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: {
          geocode_dead_letter: {
            ...baseDl,
            disposition: 'permanent_terminal' as const,
            eligible_replay: false,
          },
        },
        nowMs: now,
        maxReplayAttempts: max,
      })
    ).toEqual({ ok: false, reason: 'permanent_terminal' })
  })

  it('skips dead_letter disposition', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: {
          geocode_dead_letter: {
            ...baseDl,
            disposition: 'dead_letter' as const,
            eligible_replay: false,
          },
        },
        nowMs: now,
        maxReplayAttempts: max,
      })
    ).toEqual({ ok: false, reason: 'not_retryable_disposition' })
  })

  it('skips when cooldown not elapsed', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: {
          geocode_dead_letter: { ...baseDl, classified_at_ms: now - 30_000, replay_cooldown_ms: 60_000 },
        },
        nowMs: now,
        maxReplayAttempts: max,
      })
    ).toEqual({ ok: false, reason: 'cooldown_active' })
  })

  it('allows when cooldown elapsed', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: {
          geocode_dead_letter: { ...baseDl, classified_at_ms: now - 120_000, replay_cooldown_ms: 60_000 },
        },
        nowMs: now,
        maxReplayAttempts: max,
      })
    ).toEqual({ ok: true })
  })

  it('skips replay_exhausted when replay_count >= max', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: {
          geocode_dead_letter: {
            ...baseDl,
            classified_at_ms: now - 120_000,
            replay_cooldown_ms: 60_000,
            replay_count: max,
          },
        },
        nowMs: now,
        maxReplayAttempts: max,
      })
    ).toEqual({ ok: false, reason: 'replay_exhausted' })
  })

  it('rejects empty_results when requireTransientProvider', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: {
          geocode_dead_letter: {
            ...baseDl,
            reasons: ['empty_or_unresolved_results'],
            classified_at_ms: now - 120_000,
          },
        },
        nowMs: now,
        maxReplayAttempts: max,
        requireTransientProvider: true,
      })
    ).toEqual({ ok: false, reason: 'not_transient_provider' })
  })

  it('rejects rows with coordinates when requireNullCoordinates', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: { geocode_dead_letter: { ...baseDl, classified_at_ms: now - 120_000 } },
        nowMs: now,
        maxReplayAttempts: max,
        requireNullCoordinates: true,
        lat: 38.2,
        lng: -85.7,
      })
    ).toEqual({ ok: false, reason: 'has_coordinates' })
  })

  it('rejects wrong schema_version', () => {
    expect(
      evaluateGeocodeDeadLetterReplayEligibility({
        status: 'needs_check',
        failureDetails: {
          geocode_dead_letter: { ...baseDl, schema_version: 0, classified_at_ms: now - 120_000 },
        },
        nowMs: now,
        maxReplayAttempts: max,
      })
    ).toEqual({ ok: false, reason: 'no_dead_letter' })
  })
})

describe('runBoundedGeocodeDeadLetterReplay', () => {
  const now = 5_000_000
  const pastDl = { ...baseDl, classified_at_ms: now - 200_000, replay_cooldown_ms: 60_000 }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('respects limit (no replay-all) and increments replay_count', async () => {
    const rowA = {
      id: 'a',
      status: 'needs_check',
      failure_details: { geocode_dead_letter: { ...pastDl, replay_count: 0 } },
      failure_reasons: ['geocode_failed'],
    }
    const rowB = {
      id: 'b',
      status: 'needs_check',
      failure_details: { geocode_dead_letter: { ...pastDl, replay_count: 0 } },
      failure_reasons: [],
    }

    let fromCalls = 0
    mockFromBase.mockImplementation(() => {
      fromCalls += 1
      if (fromCalls === 1) {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: async () => ({ data: [rowA, rowB], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      return {
        update: (payload: Record<string, unknown>) => {
          const fd = payload.failure_details as { geocode_dead_letter?: { replay_count?: number } }
          expect(fd?.geocode_dead_letter?.replay_count).toBe(1)
          expect(payload.status).toBe('needs_geocode')
          expect(payload.geocode_attempts).toBe(0)
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { id: 'a' }, error: null }),
                }),
              }),
            }),
          }
        },
      }
    })

    const result = await runBoundedGeocodeDeadLetterReplay({ limit: 1, nowMs: now, maxReplayAttempts: 4 })
    expect(result.eligible).toBe(2)
    expect(result.attempted).toBe(1)
    expect(result.replayed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.updateErrors).toBe(0)
    expect(result.lostRaces).toBe(0)
    expect(emitObservabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({ event: ObservabilityEvents.geocode.deadLetterReplayed, replayCount: 1 })
    )
  })

  it('emits replay exhausted when scan hits exhausted rows', async () => {
    const exhausted = {
      id: 'x',
      status: 'needs_check',
      failure_details: {
        geocode_dead_letter: { ...pastDl, replay_count: DEFAULT_MAX_GEOCODE_DEAD_LETTER_REPLAYS },
      },
      failure_reasons: [],
    }

    let fromCalls = 0
    mockFromBase.mockImplementation(() => {
      fromCalls += 1
      if (fromCalls === 1) {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: async () => ({ data: [exhausted], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      return { update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({}) }) }) }) }) }
    })

    const result = await runBoundedGeocodeDeadLetterReplay({ limit: 5, nowMs: now })
    expect(result.eligible).toBe(0)
    expect(result.replayed).toBe(0)
    expect(result.updateErrors).toBe(0)
    expect(result.lostRaces).toBe(0)
    expect(emitObservabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({ event: ObservabilityEvents.geocode.replayExhausted, exhaustedSkips: 1 })
    )
  })

  it('counts concurrent skip when update matches zero rows', async () => {
    const row = {
      id: 'c',
      status: 'needs_check',
      failure_details: { geocode_dead_letter: { ...pastDl, replay_count: 0 } },
      failure_reasons: [],
    }
    let fromCalls = 0
    mockFromBase.mockImplementation(() => {
      fromCalls += 1
      if (fromCalls === 1) {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: async () => ({ data: [row], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }
    })

    const result = await runBoundedGeocodeDeadLetterReplay({ limit: 1, nowMs: now })
    expect(result.attempted).toBe(1)
    expect(result.replayed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.updateErrors).toBe(0)
    expect(result.lostRaces).toBe(1)
    expect(emitObservabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ObservabilityEvents.geocode.deadLetterReplayPartialFailures,
        updateErrors: 0,
        lostRaces: 1,
      })
    )
  })

  it('counts update errors and emits partial-failure telemetry', async () => {
    const row = {
      id: 'd',
      status: 'needs_check',
      failure_details: { geocode_dead_letter: { ...pastDl, replay_count: 0 } },
      failure_reasons: [],
    }
    let fromCalls = 0
    mockFromBase.mockImplementation(() => {
      fromCalls += 1
      if (fromCalls === 1) {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: async () => ({ data: [row], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate key violates moderation_status index' },
                }),
              }),
            }),
          }),
        }),
      }
    })

    const result = await runBoundedGeocodeDeadLetterReplay({ limit: 1, nowMs: now })
    expect(result.replayed).toBe(0)
    expect(result.updateErrors).toBe(1)
    expect(result.lostRaces).toBe(0)
    expect(emitObservabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ObservabilityEvents.geocode.deadLetterReplayPartialFailures,
        updateErrors: 1,
        lostRaces: 0,
      })
    )
  })
})
