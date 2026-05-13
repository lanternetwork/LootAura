/**
 * Tier 0 deterministic parser health scoring (pure; no I/O, env, or logging).
 * Invalid or incomplete metrics fail closed toward failing.
 */

export type ParserHealthStatus = 'healthy' | 'degraded' | 'failing'

export type ParserHealthReason =
  | 'invalid_metrics'
  | 'high_fixture_mismatch_rate'
  | 'high_zero_listing_rate'
  | 'high_selector_missing_rate'
  | 'high_malformed_source_data_rate'
  | 'high_unsupported_layout_rate'
  | 'high_extraction_empty_rate'
  | 'high_normalization_failed_rate'
  | 'parse_duration_degraded'
  | 'duplicate_suppression_anomaly'

/** Aggregate counts over a bounded evaluation window (fixtures, batch, etc.). */
export type ParserHealthCounts = {
  total: number
  fixtureMismatch: number
  zeroListings: number
  selectorMissing: number
  malformedSourceData: number
  unsupportedLayout: number
  extractionEmpty: number
  normalizationFailed: number
  /** Sum of per-sample parse durations (ms). */
  parseDurationSumMs: number
  /** Max single-sample parse duration (ms). */
  parseDurationMaxMs: number
  duplicateSuppressed: number
  /** Expected duplicate suppressions when healthy; used for anomaly detection only. */
  duplicateSuppressedExpected?: number
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
  extractionEmptyFailing: number
  extractionEmptyDegraded: number
  normalizationFailedFailing: number
  normalizationFailedDegraded: number
  parseMeanMsDegraded: number
  parseMeanMsFailing: number
  parseMaxMsDegraded: number
  parseMaxMsFailing: number
  duplicateSuppressionRatioFailing: number
  duplicateSuppressionRatioDegraded: number
}

export function defaultParserHealthThresholds(): ParserHealthThresholds {
  return {
    fixtureMismatchFailing: 0.35,
    fixtureMismatchDegraded: 0.12,
    zeroListingFailing: 0.45,
    zeroListingDegraded: 0.18,
    selectorMissingFailing: 0.4,
    selectorMissingDegraded: 0.15,
    malformedFailing: 0.35,
    malformedDegraded: 0.12,
    unsupportedLayoutFailing: 0.35,
    unsupportedLayoutDegraded: 0.12,
    extractionEmptyFailing: 0.4,
    extractionEmptyDegraded: 0.15,
    normalizationFailedFailing: 0.3,
    normalizationFailedDegraded: 0.1,
    parseMeanMsDegraded: 800,
    parseMeanMsFailing: 2500,
    parseMaxMsDegraded: 2000,
    parseMaxMsFailing: 8000,
    duplicateSuppressionRatioFailing: 6,
    duplicateSuppressionRatioDegraded: 3,
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x) || x < 0) return 0
  return Math.min(1, x)
}

function isValidCounts(c: ParserHealthCounts): boolean {
  if (!Number.isFinite(c.total) || c.total <= 0) return false
  const nonNeg = [
    c.fixtureMismatch,
    c.zeroListings,
    c.selectorMissing,
    c.malformedSourceData,
    c.unsupportedLayout,
    c.extractionEmpty,
    c.normalizationFailed,
    c.parseDurationSumMs,
    c.parseDurationMaxMs,
    c.duplicateSuppressed,
  ]
  for (const n of nonNeg) {
    if (!Number.isFinite(n) || n < 0) return false
  }
  if (c.duplicateSuppressedExpected != null) {
    if (!Number.isFinite(c.duplicateSuppressedExpected) || c.duplicateSuppressedExpected < 0) return false
  }
  return true
}

/** 0 = healthy, 1 = degraded, 2 = failing */
function rateTier(rate: number, degradedAt: number, failingAt: number): 0 | 1 | 2 {
  if (rate >= failingAt) return 2
  if (rate >= degradedAt) return 1
  return 0
}

function durationTier(
  meanMs: number,
  maxMs: number,
  th: ParserHealthThresholds
): 0 | 1 | 2 {
  let worst: 0 | 1 | 2 = 0
  if (Number.isFinite(meanMs)) {
    if (meanMs >= th.parseMeanMsFailing) worst = 2
    else if (meanMs >= th.parseMeanMsDegraded) worst = 1
  }
  if (Number.isFinite(maxMs)) {
    if (maxMs >= th.parseMaxMsFailing) worst = 2
    else if (maxMs >= th.parseMaxMsDegraded && worst < 2) worst = Math.max(worst, 1) as 0 | 1 | 2
  }
  return worst
}

function duplicateTier(counts: ParserHealthCounts, th: ParserHealthThresholds): 0 | 1 | 2 {
  const expected = counts.duplicateSuppressedExpected ?? 0
  if (expected <= 0 || counts.duplicateSuppressed <= 0) return 0
  const ratio = counts.duplicateSuppressed / expected
  if (!Number.isFinite(ratio)) return 0
  if (ratio >= th.duplicateSuppressionRatioFailing) return 2
  if (ratio >= th.duplicateSuppressionRatioDegraded) return 1
  return 0
}

const REASON_ORDER: ParserHealthReason[] = [
  'invalid_metrics',
  'high_fixture_mismatch_rate',
  'high_zero_listing_rate',
  'high_selector_missing_rate',
  'high_malformed_source_data_rate',
  'high_unsupported_layout_rate',
  'high_extraction_empty_rate',
  'high_normalization_failed_rate',
  'parse_duration_degraded',
  'duplicate_suppression_anomaly',
]

function sortReasons(reasons: ParserHealthReason[]): ParserHealthReason[] {
  const set = new Set(reasons)
  return REASON_ORDER.filter((r) => set.has(r))
}

/**
 * Deterministic health from aggregate counts. Fail-closed: invalid inputs → failing + invalid_metrics.
 */
export function classifyParserHealthFromCounts(
  counts: ParserHealthCounts,
  thresholds: ParserHealthThresholds
): { status: ParserHealthStatus; score: number; reasons: ParserHealthReason[] } {
  if (!isValidCounts(counts)) {
    return { status: 'failing', score: 0, reasons: ['invalid_metrics'] }
  }

  const t = counts.total
  const mismatchR = clamp01(counts.fixtureMismatch / t)
  const zeroR = clamp01(counts.zeroListings / t)
  const selR = clamp01(counts.selectorMissing / t)
  const malR = clamp01(counts.malformedSourceData / t)
  const unsR = clamp01(counts.unsupportedLayout / t)
  const extR = clamp01(counts.extractionEmpty / t)
  const normR = clamp01(counts.normalizationFailed / t)
  const meanMs = counts.parseDurationSumMs / t
  const maxMs = counts.parseDurationMaxMs

  const tiers: Array<{ tier: 0 | 1 | 2; reason: ParserHealthReason }> = [
    { tier: rateTier(mismatchR, thresholds.fixtureMismatchDegraded, thresholds.fixtureMismatchFailing), reason: 'high_fixture_mismatch_rate' },
    { tier: rateTier(zeroR, thresholds.zeroListingDegraded, thresholds.zeroListingFailing), reason: 'high_zero_listing_rate' },
    { tier: rateTier(selR, thresholds.selectorMissingDegraded, thresholds.selectorMissingFailing), reason: 'high_selector_missing_rate' },
    { tier: rateTier(malR, thresholds.malformedDegraded, thresholds.malformedFailing), reason: 'high_malformed_source_data_rate' },
    { tier: rateTier(unsR, thresholds.unsupportedLayoutDegraded, thresholds.unsupportedLayoutFailing), reason: 'high_unsupported_layout_rate' },
    { tier: rateTier(extR, thresholds.extractionEmptyDegraded, thresholds.extractionEmptyFailing), reason: 'high_extraction_empty_rate' },
    { tier: rateTier(normR, thresholds.normalizationFailedDegraded, thresholds.normalizationFailedFailing), reason: 'high_normalization_failed_rate' },
  ]

  const durTier = durationTier(meanMs, maxMs, thresholds)
  if (durTier > 0) {
    tiers.push({ tier: durTier, reason: 'parse_duration_degraded' })
  }

  const dupTier = duplicateTier(counts, thresholds)
  if (dupTier > 0) {
    tiers.push({ tier: dupTier, reason: 'duplicate_suppression_anomaly' })
  }

  let worst: 0 | 1 | 2 = 0
  const reasons: ParserHealthReason[] = []
  for (const { tier, reason } of tiers) {
    if (tier > 0) {
      worst = Math.max(worst, tier) as 0 | 1 | 2
      reasons.push(reason)
    }
  }

  const status: ParserHealthStatus = worst === 2 ? 'failing' : worst === 1 ? 'degraded' : 'healthy'
  const failingCount = tiers.filter((x) => x.tier === 2).length
  const adjustedStatus: ParserHealthStatus =
    failingCount >= 2 && status === 'degraded' ? 'failing' : status

  const uniqueReasons = sortReasons([...new Set(reasons)])
  const degradedOnlySignals = tiers.filter((x) => x.tier === 1).length
  const failingSignals = tiers.filter((x) => x.tier === 2).length

  let score: number
  if (adjustedStatus === 'healthy') {
    score = 100
  } else if (adjustedStatus === 'degraded') {
    score = Math.max(35, 78 - degradedOnlySignals * 7 - failingSignals * 4)
  } else {
    score = Math.max(5, 32 - failingSignals * 6)
  }

  return {
    status: adjustedStatus,
    score,
    reasons: uniqueReasons,
  }
}
