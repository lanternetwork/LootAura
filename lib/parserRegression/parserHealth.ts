/**
 * Deterministic parser / source health scoring from normalized metrics (pure, no I/O).
 * Rates are in [0, 1]; durations are non-negative milliseconds. Invalid inputs fail closed.
 */

export type ParserHealthStatus = 'healthy' | 'degraded' | 'failing'

export type ParserHealthReason =
  | 'invalid_metrics'
  | 'high_fixture_mismatch_rate'
  | 'high_zero_listing_rate'
  | 'high_selector_missing_rate'
  | 'high_malformed_source_rate'
  | 'high_unsupported_layout_rate'
  | 'slow_average_parse_duration'
  | 'duplicate_suppression_anomaly'

/** Normalized regression / runtime signals (all required; use 0 for “none”). */
export type ParserHealthMetricsInput = {
  fixtureMismatchRate: number
  zeroListingRate: number
  selectorMissingRate: number
  malformedSourceRate: number
  unsupportedLayoutRate: number
  averageParseDurationMs: number
  duplicateSuppressionAnomalyRate: number
}

export type ParserHealthThresholds = {
  fixtureMismatchFailing: number
  fixtureMismatchDegraded: number
  zeroListingFailing: number
  zeroListingDegraded: number
  selectorMissingFailing: number
  selectorMissingDegraded: number
  malformedFailing: number
  malformedDegraded: number
  unsupportedLayoutFailing: number
  unsupportedLayoutDegraded: number
  averageParseDurationMsFailing: number
  averageParseDurationMsDegraded: number
  duplicateSuppressionAnomalyFailing: number
  duplicateSuppressionAnomalyDegraded: number
}

export type ParserHealthResult = {
  status: ParserHealthStatus
  score: number
  reasons: ParserHealthReason[]
}

/** Explicit defaults (rates in [0,1], durations in ms). */
export const DEFAULT_PARSER_HEALTH_THRESHOLDS: Readonly<ParserHealthThresholds> = {
  fixtureMismatchFailing: 0.35,
  fixtureMismatchDegraded: 0.12,
  zeroListingFailing: 0.55,
  zeroListingDegraded: 0.25,
  selectorMissingFailing: 0.4,
  selectorMissingDegraded: 0.15,
  malformedFailing: 0.45,
  malformedDegraded: 0.18,
  unsupportedLayoutFailing: 0.35,
  unsupportedLayoutDegraded: 0.12,
  averageParseDurationMsFailing: 6000,
  averageParseDurationMsDegraded: 2000,
  duplicateSuppressionAnomalyFailing: 0.6,
  duplicateSuppressionAnomalyDegraded: 0.35,
} as const

export type ParserHealthCounts = {
  total: number
  fixtureMismatch: number
  zeroListings: number
  selectorMissing: number
  malformedSourceData: number
  unsupportedLayout: number
  extractionEmpty: number
  normalizationFailed: number
  parseDurationSumMs: number
  parseDurationMaxMs: number
  duplicateSuppressed: number
  duplicateSuppressedExpected: number
}

function isRateValid(r: number): boolean {
  return Number.isFinite(r) && r >= 0 && r <= 1
}

function isDurationValid(ms: number): boolean {
  return Number.isFinite(ms) && ms >= 0
}

function sortedUniqueReasons(reasons: ParserHealthReason[]): ParserHealthReason[] {
  const order: ParserHealthReason[] = [
    'invalid_metrics',
    'high_fixture_mismatch_rate',
    'high_zero_listing_rate',
    'high_selector_missing_rate',
    'high_malformed_source_rate',
    'high_unsupported_layout_rate',
    'slow_average_parse_duration',
    'duplicate_suppression_anomaly',
  ]
  const set = new Set(reasons)
  return order.filter((x) => set.has(x))
}

export function defaultParserHealthThresholds(): ParserHealthThresholds {
  return { ...DEFAULT_PARSER_HEALTH_THRESHOLDS }
}

function thresholdsWellOrdered(t: ParserHealthThresholds): boolean {
  const ratePairs: [number, number][] = [
    [t.fixtureMismatchDegraded, t.fixtureMismatchFailing],
    [t.zeroListingDegraded, t.zeroListingFailing],
    [t.selectorMissingDegraded, t.selectorMissingFailing],
    [t.malformedDegraded, t.malformedFailing],
    [t.unsupportedLayoutDegraded, t.unsupportedLayoutFailing],
    [t.duplicateSuppressionAnomalyDegraded, t.duplicateSuppressionAnomalyFailing],
  ]
  if (!ratePairs.every(([d, f]) => Number.isFinite(d) && Number.isFinite(f) && f > d)) return false
  return (
    Number.isFinite(t.averageParseDurationMsDegraded) &&
    Number.isFinite(t.averageParseDurationMsFailing) &&
    t.averageParseDurationMsFailing > t.averageParseDurationMsDegraded
  )
}

function axisState(
  value: number,
  degradedAt: number,
  failingAt: number
): 'ok' | 'degraded' | 'failing' {
  if (value >= failingAt) return 'failing'
  if (value >= degradedAt) return 'degraded'
  return 'ok'
}

function duplicateSuppressionAnomalyRateFromCounts(c: ParserHealthCounts): number {
  const exp = c.duplicateSuppressedExpected
  const sup = c.duplicateSuppressed
  if (!Number.isFinite(exp) || !Number.isFinite(sup) || sup < 0 || exp < 0) return Number.NaN
  if (exp === 0) return sup === 0 ? 0 : 1
  return Math.min(1, Math.abs(sup - exp) / exp)
}

/**
 * Map fixture-level counters to normalized metrics, then classify health.
 * Used by on-disk fixture diagnostics (`buildParserDiagnostics`).
 */
export function classifyParserHealthFromCounts(
  counts: ParserHealthCounts,
  thresholds: ParserHealthThresholds = defaultParserHealthThresholds()
): ParserHealthResult {
  const t = counts.total
  if (!Number.isFinite(t) || t <= 0) {
    return { status: 'failing', score: 0, reasons: sortedUniqueReasons(['invalid_metrics']) }
  }
  const zeroNumerator = counts.zeroListings + counts.extractionEmpty
  const malformedNumerator = counts.malformedSourceData + counts.normalizationFailed
  const input: ParserHealthMetricsInput = {
    fixtureMismatchRate: counts.fixtureMismatch / t,
    zeroListingRate: zeroNumerator / t,
    selectorMissingRate: counts.selectorMissing / t,
    malformedSourceRate: malformedNumerator / t,
    unsupportedLayoutRate: counts.unsupportedLayout / t,
    averageParseDurationMs: counts.parseDurationSumMs / t,
    duplicateSuppressionAnomalyRate: duplicateSuppressionAnomalyRateFromCounts(counts),
  }
  return classifyParserHealth(input, thresholds)
}

/**
 * Deterministic: invalid metrics → failing score 0.
 * Otherwise score from 100 minus weighted penalties; status from worst axis + score bands.
 */
export function classifyParserHealth(
  input: ParserHealthMetricsInput,
  thresholds: ParserHealthThresholds = defaultParserHealthThresholds()
): ParserHealthResult {
  const reasons: ParserHealthReason[] = []
  const rates: number[] = [
    input.fixtureMismatchRate,
    input.zeroListingRate,
    input.selectorMissingRate,
    input.malformedSourceRate,
    input.unsupportedLayoutRate,
    input.duplicateSuppressionAnomalyRate,
  ]

  if (rates.some((r) => !isRateValid(r)) || !isDurationValid(input.averageParseDurationMs) || !thresholdsWellOrdered(thresholds)) {
    reasons.push('invalid_metrics')
    return { status: 'failing', score: 0, reasons: sortedUniqueReasons(reasons) }
  }

  let penalty = 0
  /** 0 = ok, 1 = degraded, 2 = failing (avoids TS narrowing on `worst` mutated inside nested `bump`). */
  let worstRank = 0

  const bump = (
    st: 'ok' | 'degraded' | 'failing',
    degPen: number,
    failPen: number,
    reason: ParserHealthReason
  ) => {
    if (st === 'failing') {
      worstRank = 2
      penalty += failPen
      reasons.push(reason)
    } else if (st === 'degraded') {
      if (worstRank < 2) worstRank = 1
      penalty += degPen
      reasons.push(reason)
    }
  }

  bump(
    axisState(
      input.fixtureMismatchRate,
      thresholds.fixtureMismatchDegraded,
      thresholds.fixtureMismatchFailing
    ),
    22,
    48,
    'high_fixture_mismatch_rate'
  )
  bump(
    axisState(input.zeroListingRate, thresholds.zeroListingDegraded, thresholds.zeroListingFailing),
    20,
    45,
    'high_zero_listing_rate'
  )
  bump(
    axisState(
      input.selectorMissingRate,
      thresholds.selectorMissingDegraded,
      thresholds.selectorMissingFailing
    ),
    18,
    42,
    'high_selector_missing_rate'
  )
  bump(
    axisState(input.malformedSourceRate, thresholds.malformedDegraded, thresholds.malformedFailing),
    16,
    40,
    'high_malformed_source_rate'
  )
  bump(
    axisState(
      input.unsupportedLayoutRate,
      thresholds.unsupportedLayoutDegraded,
      thresholds.unsupportedLayoutFailing
    ),
    14,
    38,
    'high_unsupported_layout_rate'
  )

  const durMs = input.averageParseDurationMs
  const durSt =
    durMs >= thresholds.averageParseDurationMsFailing
      ? 'failing'
      : durMs >= thresholds.averageParseDurationMsDegraded
        ? 'degraded'
        : 'ok'
  bump(durSt, 14, 32, 'slow_average_parse_duration')

  bump(
    axisState(
      input.duplicateSuppressionAnomalyRate,
      thresholds.duplicateSuppressionAnomalyDegraded,
      thresholds.duplicateSuppressionAnomalyFailing
    ),
    12,
    28,
    'duplicate_suppression_anomaly'
  )

  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)))

  let status: ParserHealthStatus = 'healthy'
  if (worstRank === 2 || score < 42) {
    status = 'failing'
  } else if (worstRank === 1 || score < 78 || reasons.length > 0) {
    status = 'degraded'
  }

  return {
    status,
    score,
    reasons: sortedUniqueReasons(reasons),
  }
}
