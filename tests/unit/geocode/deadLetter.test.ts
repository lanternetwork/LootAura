import { describe, it, expect } from 'vitest'
import {
  buildGeocodeDeadLetterEnvelope,
  carryOverReplayFieldsOntoDeadLetterEnvelope,
  classifyGeocodeTerminalDeadLetter,
  defaultGeocodeDeadLetterThresholds,
  extractPriorDeadLetterClassificationCount,
  mergeGeocodeDeadLetterIntoFailureDetails,
  type GeocodeDeadLetterDecision,
} from '@/lib/geocode/deadLetter'

const T = () => defaultGeocodeDeadLetterThresholds()

describe('classifyGeocodeTerminalDeadLetter', () => {
  it('fail-closed: invalid attempt count -> permanent_terminal + invalid_metrics', () => {
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 2,
        hit429: true,
        priorClassificationCount: 0,
      },
      T()
    )
    expect(d.disposition).toBe('permanent_terminal')
    expect(d.eligibleReplay).toBe(false)
    expect(d.replayCooldownMs).toBe(0)
    expect(d.reasons).toContain('invalid_metrics')
  })

  it('empty_input -> permanent_terminal (missing_address_input)', () => {
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 3,
        hit429: false,
        noCoordsReason: 'empty_input',
        priorClassificationCount: 0,
      },
      T()
    )
    expect(d.disposition).toBe('permanent_terminal')
    expect(d.reasons).toContain('missing_address_input')
    expect(d.eligibleReplay).toBe(false)
  })

  it('429 -> retryable with transient cooldown when under replay budget', () => {
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 3,
        hit429: true,
        priorClassificationCount: 0,
      },
      T()
    )
    expect(d.disposition).toBe('retryable')
    expect(d.eligibleReplay).toBe(true)
    expect(d.replayCooldownMs).toBe(T().transientReplayCooldownMs)
    expect(d.reasons).toContain('transient_provider')
  })

  it('rate_limited on noCoordsReason counts as transient', () => {
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 3,
        hit429: false,
        noCoordsReason: 'rate_limited',
        priorClassificationCount: 0,
      },
      T()
    )
    expect(d.disposition).toBe('retryable')
    expect(d.reasons).toContain('transient_provider')
  })

  it('exhausts transient replay budget -> permanent_terminal + replay_budget_exhausted', () => {
    const thresholds = T()
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 3,
        hit429: true,
        priorClassificationCount: thresholds.maxTransientTerminalClassifications,
      },
      thresholds
    )
    expect(d.disposition).toBe('permanent_terminal')
    expect(d.eligibleReplay).toBe(false)
    expect(d.reasons).toContain('replay_budget_exhausted')
    expect(d.reasons).toContain('transient_provider')
  })

  it('low_confidence -> dead_letter with dead-letter cooldown', () => {
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 3,
        hit429: false,
        noCoordsReason: 'low_confidence',
        priorClassificationCount: 0,
      },
      T()
    )
    expect(d.disposition).toBe('dead_letter')
    expect(d.eligibleReplay).toBe(false)
    expect(d.replayCooldownMs).toBe(T().deadLetterCooldownMs)
    expect(d.reasons).toContain('ambiguous_or_low_confidence')
  })

  it('empty_results (non-transient) -> dead_letter', () => {
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 3,
        hit429: false,
        noCoordsReason: 'empty_results',
        priorClassificationCount: 0,
      },
      T()
    )
    expect(d.disposition).toBe('dead_letter')
    expect(d.reasons).toContain('empty_or_unresolved_results')
  })

  it('unknown terminal signal defaults to dead_letter with empty_or_unresolved_results', () => {
    const d = classifyGeocodeTerminalDeadLetter(
      {
        geocodeAttemptsAtTerminal: 3,
        hit429: false,
        noCoordsReason: 'something_else',
        priorClassificationCount: 0,
      },
      T()
    )
    expect(d.disposition).toBe('dead_letter')
    expect(d.reasons).toContain('empty_or_unresolved_results')
  })
})

describe('extractPriorDeadLetterClassificationCount', () => {
  it('returns 0 for missing or invalid shapes', () => {
    expect(extractPriorDeadLetterClassificationCount(undefined)).toBe(0)
    expect(extractPriorDeadLetterClassificationCount(null)).toBe(0)
    expect(extractPriorDeadLetterClassificationCount([])).toBe(0)
    expect(extractPriorDeadLetterClassificationCount('x')).toBe(0)
    expect(extractPriorDeadLetterClassificationCount({ geocode_dead_letter: [] })).toBe(0)
    expect(
      extractPriorDeadLetterClassificationCount({
        geocode_dead_letter: { classification_count: -1 },
      })
    ).toBe(0)
  })

  it('reads floor of non-negative classification_count', () => {
    expect(
      extractPriorDeadLetterClassificationCount({
        geocode_dead_letter: { classification_count: 3.7 },
      })
    ).toBe(3)
  })
})

describe('buildGeocodeDeadLetterEnvelope + merge', () => {
  it('increments classification_count from prior', () => {
    const decision: GeocodeDeadLetterDecision = {
      disposition: 'retryable',
      replayCooldownMs: 1000,
      reasons: ['transient_provider'],
      eligibleReplay: true,
    }
    const env = buildGeocodeDeadLetterEnvelope(decision, 2, 99_000)
    expect(env.classification_count).toBe(3)
    expect(env.classified_at_ms).toBe(99_000)
    expect(env.eligible_replay).toBe(true)
  })

  it('merge preserves other failure_details keys', () => {
    const decision: GeocodeDeadLetterDecision = {
      disposition: 'dead_letter',
      replayCooldownMs: 500,
      reasons: ['empty_or_unresolved_results'],
      eligibleReplay: false,
    }
    const env = buildGeocodeDeadLetterEnvelope(decision, 0, 1)
    const merged = mergeGeocodeDeadLetterIntoFailureDetails(
      { geocode: { schema_version: 2, attemptCount: 3 } },
      env
    )
    expect(merged.geocode).toEqual({ schema_version: 2, attemptCount: 3 })
    expect(merged.geocode_dead_letter).toEqual(env)
  })
})

describe('carryOverReplayFieldsOntoDeadLetterEnvelope', () => {
  it('copies replay_count and last_replay_at_ms from prior failure_details', () => {
    const decision: GeocodeDeadLetterDecision = {
      disposition: 'retryable',
      replayCooldownMs: 1000,
      reasons: ['transient_provider'],
      eligibleReplay: true,
    }
    const fresh = buildGeocodeDeadLetterEnvelope(decision, 1, 50_000)
    const merged = carryOverReplayFieldsOntoDeadLetterEnvelope(fresh, {
      geocode_dead_letter: { replay_count: 2, last_replay_at_ms: 40_000 },
    })
    expect(merged.replay_count).toBe(2)
    expect(merged.last_replay_at_ms).toBe(40_000)
  })
})
