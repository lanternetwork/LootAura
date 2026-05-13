/**
 * Tier 0 dead-letter / replay classification for geocode terminal outcomes (pure + merge helpers).
 * No PII: reasons are coarse enums; row UUIDs belong in DB telemetry at call sites only.
 */

export type DeadLetterDisposition = 'retryable' | 'dead_letter' | 'permanent_terminal'

export type GeocodeDeadLetterReason =
  | 'transient_provider'
  | 'ambiguous_or_low_confidence'
  | 'empty_or_unresolved_results'
  | 'missing_address_input'
  | 'replay_budget_exhausted'
  | 'invalid_metrics'

export interface GeocodeTerminalDeadLetterInput {
  /** `geocode_attempts` after claim bump (terminal path uses >= 3). */
  geocodeAttemptsAtTerminal: number
  hit429: boolean
  /** `GeocodeAddressOutcome.noCoordsReason` or synthetic. */
  noCoordsReason?: string | null
  /** `GeocodeAddressOutcome.providerClassification` or synthetic. */
  providerClassification?: string | null
  /**
   * Prior `failure_details.geocode_dead_letter.classification_count` end value (0 if absent).
   * Increments once per terminal classification event while row remains in geocode lifecycle.
   */
  priorClassificationCount: number
}

export interface GeocodeDeadLetterThresholds {
  /** After this many cumulative terminal classifications, transient bucket becomes permanent (fail-closed). */
  maxTransientTerminalClassifications: number
  /** Cooldown hint for operators / future replay automation (ms). */
  transientReplayCooldownMs: number
  /** Cooldown hint for dead-letter human queue (ms). */
  deadLetterCooldownMs: number
}

export interface GeocodeDeadLetterDecision {
  disposition: DeadLetterDisposition
  replayCooldownMs: number
  reasons: GeocodeDeadLetterReason[]
  /** True when disposition is `retryable` (safe to reset row to `needs_geocode` after cooldown, bounded elsewhere). */
  eligibleReplay: boolean
}

export const GEOCODE_DEAD_LETTER_SCHEMA_VERSION = 1 as const

export type GeocodeDeadLetterEnvelope = {
  schema_version: typeof GEOCODE_DEAD_LETTER_SCHEMA_VERSION
  disposition: DeadLetterDisposition
  classification_count: number
  classified_at_ms: number
  replay_cooldown_ms: number
  eligible_replay: boolean
  reasons: GeocodeDeadLetterReason[]
  /** Successful bounded replays to `needs_geocode` (admin/cron). */
  replay_count?: number
  last_replay_at_ms?: number
}

/** Bounded replays per row after transient terminal dead-letter (separate from classification_count). */
export const DEFAULT_MAX_GEOCODE_DEAD_LETTER_REPLAYS = 4 as const

export function defaultGeocodeDeadLetterThresholds(): GeocodeDeadLetterThresholds {
  return {
    maxTransientTerminalClassifications: 4,
    transientReplayCooldownMs: 10 * 60_000,
    deadLetterCooldownMs: 24 * 60 * 60_000,
  }
}

function isTransientProviderSignal(input: GeocodeTerminalDeadLetterInput): boolean {
  if (input.hit429) return true
  const n = (input.noCoordsReason ?? '').trim()
  const p = (input.providerClassification ?? '').trim()
  if (n === 'rate_limited' || n === 'rate_limited_soft' || n === 'fetch_exception') return true
  if (p === 'rate_limited' || p === 'rate_limited_soft' || p === 'fetch_exception') return true
  if (n === 'http_not_ok' || p === 'http_not_ok') return true
  return false
}

function isMissingAddressInput(input: GeocodeTerminalDeadLetterInput): boolean {
  return (input.noCoordsReason ?? '').trim() === 'empty_input'
}

function isEmptyOrUnresolvedResults(input: GeocodeTerminalDeadLetterInput): boolean {
  const n = (input.noCoordsReason ?? '').trim()
  const p = (input.providerClassification ?? '').trim()
  if (n === 'empty_results' || p === 'empty_results') return true
  return false
}

function isAmbiguousOrLowConfidence(input: GeocodeTerminalDeadLetterInput): boolean {
  const n = (input.noCoordsReason ?? '').trim()
  if (n === 'low_confidence' || n === 'ambiguous') return true
  return false
}

function sortedUniqueReasons(reasons: GeocodeDeadLetterReason[]): GeocodeDeadLetterReason[] {
  const order: GeocodeDeadLetterReason[] = [
    'invalid_metrics',
    'replay_budget_exhausted',
    'transient_provider',
    'ambiguous_or_low_confidence',
    'empty_or_unresolved_results',
    'missing_address_input',
  ]
  const set = new Set(reasons)
  return order.filter((r) => set.has(r))
}

/**
 * Deterministic classification for a row that has exhausted in-pipeline geocode attempts (terminal).
 * Fail-closed: invalid attempt counts => `permanent_terminal` with `invalid_metrics`.
 */
export function classifyGeocodeTerminalDeadLetter(
  input: GeocodeTerminalDeadLetterInput,
  thresholds: GeocodeDeadLetterThresholds
): GeocodeDeadLetterDecision {
  const reasons: GeocodeDeadLetterReason[] = []
  const attempts = input.geocodeAttemptsAtTerminal
  if (!Number.isFinite(attempts) || attempts < 3) {
    reasons.push('invalid_metrics')
    return {
      disposition: 'permanent_terminal',
      replayCooldownMs: 0,
      reasons: sortedUniqueReasons(reasons),
      eligibleReplay: false,
    }
  }

  const prior = Number.isFinite(input.priorClassificationCount) ? Math.max(0, input.priorClassificationCount) : 0

  if (isMissingAddressInput(input)) {
    reasons.push('missing_address_input')
    return {
      disposition: 'permanent_terminal',
      replayCooldownMs: 0,
      reasons: sortedUniqueReasons(reasons),
      eligibleReplay: false,
    }
  }

  const transient = isTransientProviderSignal(input)
  if (transient) {
    reasons.push('transient_provider')
  }
  if (isAmbiguousOrLowConfidence(input)) {
    reasons.push('ambiguous_or_low_confidence')
  }
  if (isEmptyOrUnresolvedResults(input)) {
    reasons.push('empty_or_unresolved_results')
  }

  if (transient && prior >= thresholds.maxTransientTerminalClassifications) {
    reasons.push('replay_budget_exhausted')
    return {
      disposition: 'permanent_terminal',
      replayCooldownMs: 0,
      reasons: sortedUniqueReasons(reasons),
      eligibleReplay: false,
    }
  }

  if (transient) {
    return {
      disposition: 'retryable',
      replayCooldownMs: thresholds.transientReplayCooldownMs,
      reasons: sortedUniqueReasons(reasons),
      eligibleReplay: true,
    }
  }

  if (reasons.length === 0) {
    reasons.push('empty_or_unresolved_results')
  }

  return {
    disposition: 'dead_letter',
    replayCooldownMs: thresholds.deadLetterCooldownMs,
    reasons: sortedUniqueReasons(reasons),
    eligibleReplay: false,
  }
}

export function extractPriorDeadLetterClassificationCount(failureDetails: unknown): number {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) return 0
  const o = failureDetails as Record<string, unknown>
  const dl = o.geocode_dead_letter
  if (!dl || typeof dl !== 'object' || Array.isArray(dl)) return 0
  const c = (dl as Record<string, unknown>).classification_count
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return 0
  return Math.floor(c)
}

export function buildGeocodeDeadLetterEnvelope(
  decision: GeocodeDeadLetterDecision,
  priorClassificationCount: number,
  referenceNowMs: number
): GeocodeDeadLetterEnvelope {
  const classification_count = priorClassificationCount + 1
  return {
    schema_version: GEOCODE_DEAD_LETTER_SCHEMA_VERSION,
    disposition: decision.disposition,
    classification_count,
    classified_at_ms: referenceNowMs,
    replay_cooldown_ms: decision.replayCooldownMs,
    eligible_replay: decision.eligibleReplay,
    reasons: [...decision.reasons],
  }
}

/** Merge `geocode_dead_letter` into `failure_details` for persistence (ops JSON blob). */
export function mergeGeocodeDeadLetterIntoFailureDetails(
  failureDetails: unknown,
  envelope: GeocodeDeadLetterEnvelope
): Record<string, unknown> {
  const base =
    failureDetails && typeof failureDetails === 'object' && !Array.isArray(failureDetails)
      ? { ...(failureDetails as Record<string, unknown>) }
      : {}
  return {
    ...base,
    geocode_dead_letter: envelope as unknown as Record<string, unknown>,
  }
}

function readGeocodeDeadLetterObject(failureDetails: unknown): Record<string, unknown> | null {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) return null
  const dl = (failureDetails as Record<string, unknown>).geocode_dead_letter
  if (!dl || typeof dl !== 'object' || Array.isArray(dl)) return null
  return dl as Record<string, unknown>
}

/** Preserve replay_count / last_replay_at_ms across a new terminal classification envelope write. */
export function carryOverReplayFieldsOntoDeadLetterEnvelope(
  envelope: GeocodeDeadLetterEnvelope,
  failureDetailsSnapshot: unknown
): GeocodeDeadLetterEnvelope {
  const prior = readGeocodeDeadLetterObject(failureDetailsSnapshot)
  if (!prior) return envelope
  const rc = prior.replay_count
  const last = prior.last_replay_at_ms
  const replayCount =
    typeof rc === 'number' && Number.isFinite(rc) && rc > 0 ? Math.floor(rc) : undefined
  const lastReplayAt =
    typeof last === 'number' && Number.isFinite(last) && last > 0 ? Math.floor(last) : undefined
  if (replayCount === undefined && lastReplayAt === undefined) return envelope
  return {
    ...envelope,
    ...(replayCount !== undefined ? { replay_count: replayCount } : {}),
    ...(lastReplayAt !== undefined ? { last_replay_at_ms: lastReplayAt } : {}),
  }
}
