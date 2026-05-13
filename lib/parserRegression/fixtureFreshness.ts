/**
 * Tier 0 fixture freshness (pure). No network or filesystem writes.
 * Malformed timestamps fail validation (fail closed → stale classification at call sites).
 */

export type FixtureFreshnessStatus = 'fresh' | 'aging' | 'stale'

export type FixtureFreshnessReason =
  | 'invalid_captured_at'
  | 'invalid_source_host'
  | 'metadata_shape_invalid'
  | 'fixture_age_aging'
  | 'fixture_age_stale'

export type FixtureFreshnessThresholds = {
  /** Age below this (ms) is `fresh`. */
  freshMaxAgeMs: number
  /** Age below this (ms) (and >= fresh) is `aging`; else `stale`. */
  agingMaxAgeMs: number
}

export function defaultFixtureFreshnessThresholds(): FixtureFreshnessThresholds {
  const day = 86_400_000
  return {
    freshMaxAgeMs: 90 * day,
    agingMaxAgeMs: 180 * day,
  }
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

export type ParserFixtureMetadataValidated = {
  pageUrl: string
  config: Record<string, unknown>
  capturedAtMs: number
  sourceHost: string
  parserVersion?: string
  sourceType?: string
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Strict fixture metadata validation (required for regression harness loads).
 */
export function validateParserFixtureMetadata(raw: unknown):
  | { ok: true; metadata: ParserFixtureMetadataValidated }
  | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'metadata_shape_invalid' }
  }
  const pageUrl = raw.pageUrl
  const config = raw.config
  const capturedAt = raw.captured_at
  const sourceHost = raw.source_host

  if (typeof pageUrl !== 'string' || pageUrl.trim().length === 0) {
    return { ok: false, error: 'metadata_shape_invalid' }
  }
  if (!isPlainObject(config)) {
    return { ok: false, error: 'metadata_shape_invalid' }
  }
  if (typeof capturedAt !== 'string' || capturedAt.trim().length === 0) {
    return { ok: false, error: 'invalid_captured_at' }
  }
  const parsed = Date.parse(capturedAt)
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: 'invalid_captured_at' }
  }
  if (typeof sourceHost !== 'string' || sourceHost.trim().length === 0) {
    return { ok: false, error: 'invalid_source_host' }
  }
  const host = sourceHost.trim().toLowerCase()
  if (!HOST_RE.test(host)) {
    return { ok: false, error: 'invalid_source_host' }
  }

  const parserVersion = raw.parser_version
  const sourceType = raw.source_type
  if (parserVersion !== undefined && typeof parserVersion !== 'string') {
    return { ok: false, error: 'metadata_shape_invalid' }
  }
  if (sourceType !== undefined && typeof sourceType !== 'string') {
    return { ok: false, error: 'metadata_shape_invalid' }
  }

  return {
    ok: true,
    metadata: {
      pageUrl: pageUrl.trim(),
      config,
      capturedAtMs: parsed,
      sourceHost: host,
      ...(typeof parserVersion === 'string' && parserVersion.trim() ? { parserVersion: parserVersion.trim() } : {}),
      ...(typeof sourceType === 'string' && sourceType.trim() ? { sourceType: sourceType.trim() } : {}),
    },
  }
}

export function evaluateFixtureFreshness(
  capturedAtMs: number,
  nowMs: number,
  thresholds: FixtureFreshnessThresholds
): { status: FixtureFreshnessStatus; reasons: FixtureFreshnessReason[] } {
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(nowMs)) {
    return { status: 'stale', reasons: ['invalid_captured_at'] }
  }
  const age = Math.max(0, nowMs - capturedAtMs)
  if (!Number.isFinite(age) || age < 0) {
    return { status: 'stale', reasons: ['invalid_captured_at'] }
  }
  if (age < thresholds.freshMaxAgeMs) {
    return { status: 'fresh', reasons: [] }
  }
  if (age < thresholds.agingMaxAgeMs) {
    return { status: 'aging', reasons: ['fixture_age_aging'] }
  }
  return { status: 'stale', reasons: ['fixture_age_stale'] }
}

/** When metadata validation fails, treat freshness as stale for fail-closed aggregation. */
export function fixtureFreshnessFromValidationFailure(error: string): {
  status: FixtureFreshnessStatus
  reasons: FixtureFreshnessReason[]
} {
  const r =
    error === 'invalid_captured_at'
      ? ('invalid_captured_at' as const)
      : error === 'invalid_source_host'
        ? ('invalid_source_host' as const)
        : ('metadata_shape_invalid' as const)
  return { status: 'stale', reasons: [r] }
}
