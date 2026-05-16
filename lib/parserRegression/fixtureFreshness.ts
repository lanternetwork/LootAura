/**
 * Fixture freshness classification (pure): strict metadata validation + age buckets.
 * No filesystem, network, or clock globals — callers pass `referenceNowMs`.
 */

export type FixtureFreshnessStatus = 'fresh' | 'aging' | 'stale'

export type FixtureFreshnessReason =
  | 'invalid_captured_at'
  | 'invalid_thresholds'
  | 'fixture_age_exceeds_stale_threshold'
  | 'fixture_age_exceeds_aging_threshold'
  | 'invalid_metadata'
  /** Aggregate diagnostics: at least one fixture exceeded stale threshold. */
  | 'fixture_age_stale'
  /** Aggregate diagnostics: at least one fixture exceeded aging threshold. */
  | 'fixture_age_aging'

export type FixtureFreshnessThresholdsMs = {
  /** Age after which fixture is "aging" (operator attention). */
  agingAfterMs: number
  /** Age after which fixture is "stale" (refresh required). */
  staleAfterMs: number
}

export type FixtureFreshnessResult = {
  status: FixtureFreshnessStatus
  ageMs: number
  reasons: FixtureFreshnessReason[]
}

export type ValidatedParserFixtureMetadata = {
  captured_at: string
  source_host: string
  parser_version?: string
  source_type?: string
  pageUrl: string
  config: unknown
}

/** Canonical disk / harness metadata thresholds (ms). */
export const DEFAULT_FIXTURE_FRESHNESS_THRESHOLDS_MS: Readonly<FixtureFreshnessThresholdsMs> = {
  agingAfterMs: 45 * 24 * 60 * 60 * 1000,
  staleAfterMs: 120 * 24 * 60 * 60 * 1000,
} as const

export type ValidatedDiskParserFixtureMetadata = {
  sourceHost: string
  capturedAtIso: string
  pageUrl: string
  config: unknown
}

export function defaultFixtureFreshnessThresholdsMs(): FixtureFreshnessThresholdsMs {
  return { ...DEFAULT_FIXTURE_FRESHNESS_THRESHOLDS_MS }
}

/** Alias for callers that omit the `Ms` suffix. */
export function defaultFixtureFreshnessThresholds(): FixtureFreshnessThresholdsMs {
  return defaultFixtureFreshnessThresholdsMs()
}

function parseCapturedAtMs(iso: string): number | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return t
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function validateSourceHostField(rawHost: string): { ok: true; host: string } | { ok: false; message: string } {
  const h = rawHost.trim().toLowerCase()
  if (h.includes('/') || h.includes('?') || h.includes('#') || h.length > 253) {
    return { ok: false, message: 'source_host must be a plain hostname (no path/query)' }
  }
  return { ok: true, host: h }
}

/**
 * Minimal metadata for freshness: `captured_at` + `source_host` only (strict).
 */
export function validateFixtureFreshnessMetadata(
  raw: unknown
): { ok: true; captured_at: string; source_host: string } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['metadata must be a JSON object'] }
  }
  const o = raw as Record<string, unknown>
  if (!isNonEmptyString(o.captured_at)) {
    errors.push('captured_at is required (non-empty ISO 8601 string)')
  } else if (parseCapturedAtMs(String(o.captured_at).trim()) === null) {
    errors.push('captured_at must be a valid ISO 8601 date string')
  }
  let hostNorm = ''
  if (!isNonEmptyString(o.source_host)) {
    errors.push('source_host is required (non-empty hostname string)')
  } else {
    const hv = validateSourceHostField(String(o.source_host))
    if (!hv.ok) errors.push(hv.message)
    else hostNorm = hv.host
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    captured_at: String(o.captured_at).trim(),
    source_host: hostNorm,
  }
}

/**
 * Strict validation for `metadata.json` used by the regression harness (fail closed).
 */
export function validateParserFixtureMetadataJson(
  raw: unknown
): { ok: true; metadata: ValidatedParserFixtureMetadata } | { ok: false; errors: string[] } {
  const base = validateFixtureFreshnessMetadata(raw)
  if (!base.ok) return base

  const errors: string[] = []
  const o = raw as Record<string, unknown>
  if (!isNonEmptyString(o.pageUrl)) {
    errors.push('pageUrl is required for harness execution')
  }
  if (!o.config || typeof o.config !== 'object' || Array.isArray(o.config)) {
    errors.push('config is required and must be an object')
  }
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const parser_version = o.parser_version
  const source_type = o.source_type
  const metadata: ValidatedParserFixtureMetadata = {
    captured_at: base.captured_at,
    source_host: base.source_host,
    pageUrl: String(o.pageUrl).trim(),
    config: o.config,
    ...(typeof parser_version === 'string' && parser_version.trim()
      ? { parser_version: parser_version.trim() }
      : {}),
    ...(typeof source_type === 'string' && source_type.trim() ? { source_type: source_type.trim() } : {}),
  }
  return { ok: true, metadata }
}

/**
 * Disk-oriented validation for `buildParserDiagnostics` (camelCase projection).
 */
export function validateParserFixtureMetadata(
  raw: unknown
): { ok: true; metadata: ValidatedDiskParserFixtureMetadata } | { ok: false; error: string } {
  const v = validateParserFixtureMetadataJson(raw)
  if (!v.ok) return { ok: false, error: v.errors.join('; ') }
  return {
    ok: true,
    metadata: {
      sourceHost: v.metadata.source_host,
      capturedAtIso: v.metadata.captured_at,
      pageUrl: v.metadata.pageUrl,
      config: v.metadata.config,
    },
  }
}

export function fixtureFreshnessFromValidationFailure(_error: string): FixtureFreshnessResult {
  return {
    status: 'stale',
    ageMs: Number.NaN,
    reasons: ['invalid_metadata'],
  }
}

/**
 * Classify fixture age vs `referenceNowMs` using deterministic thresholds only.
 */
export function evaluateFixtureFreshness(
  capturedAtIso: string,
  referenceNowMs: number,
  thresholds: FixtureFreshnessThresholdsMs = defaultFixtureFreshnessThresholdsMs()
): FixtureFreshnessResult {
  const capturedMs = parseCapturedAtMs(capturedAtIso)
  const reasons: FixtureFreshnessReason[] = []
  if (capturedMs === null) {
    reasons.push('invalid_captured_at')
    return { status: 'stale', ageMs: Number.NaN, reasons }
  }
  if (!Number.isFinite(referenceNowMs)) {
    reasons.push('invalid_metadata')
    return { status: 'stale', ageMs: Number.NaN, reasons }
  }
  const ageMs = Math.max(0, referenceNowMs - capturedMs)
  if (
    !Number.isFinite(thresholds.agingAfterMs) ||
    !Number.isFinite(thresholds.staleAfterMs) ||
    thresholds.staleAfterMs <= thresholds.agingAfterMs
  ) {
    reasons.push('invalid_thresholds')
    return { status: 'stale', ageMs, reasons }
  }
  if (ageMs >= thresholds.staleAfterMs) {
    reasons.push('fixture_age_exceeds_stale_threshold')
    return { status: 'stale', ageMs, reasons }
  }
  if (ageMs >= thresholds.agingAfterMs) {
    reasons.push('fixture_age_exceeds_aging_threshold')
    return { status: 'aging', ageMs, reasons }
  }
  return { status: 'fresh', ageMs, reasons: [] }
}
