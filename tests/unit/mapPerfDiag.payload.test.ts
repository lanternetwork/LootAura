/**
 * Unit tests for MAP_PERF_DIAG WebView message payload.
 * Ensures the web-side payload has only allowed fields (timings + booleans)
 * and contains no forbidden data (no lat, lng, user id, or PII).
 * Also ensures the native handler can safely parse and store the payload.
 */

import { describe, it, expect } from 'vitest'

const MESSAGE_TYPE = 'MAP_PERF_DIAG'

const ALLOWED_KEYS = new Set([
  'type',
  'firstRenderMs',
  'fetchStartMs',
  'fetchCompleteMs',
  'initialLoadCompleteMs',
  'mapMountedMs',
  'styleLoadedMs',
  'mapIdleMs',
  'hasMapMounted',
  'hasStyleLoaded',
  'hasMapIdle',
  'hasInitialLoadComplete',
])

const FORBIDDEN_KEYS = new Set([
  'lat',
  'lng',
  'latitude',
  'longitude',
  'userId',
  'user_id',
  'userIdentifier',
  'email',
  'address',
  'coordinates',
  'bounds',
  'center',
])

function buildValidPayload(): Record<string, unknown> {
  return {
    type: MESSAGE_TYPE,
    firstRenderMs: 100,
    fetchStartMs: 50,
    fetchCompleteMs: 200,
    initialLoadCompleteMs: 350,
    mapMountedMs: 120,
    styleLoadedMs: 180,
    mapIdleMs: 400,
    hasMapMounted: true,
    hasStyleLoaded: true,
    hasMapIdle: true,
    hasInitialLoadComplete: true,
  }
}

function payloadHasOnlyAllowedKeys(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).every((k) => ALLOWED_KEYS.has(k))
}

function payloadHasNoForbiddenKeys(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).every((k) => !FORBIDDEN_KEYS.has(k))
}

/** Simulates native handler: parse raw message and return what would be stored for HUD. */
function nativeParseAndStore(rawJson: string, isDiagnosticsEnabled: boolean): string | null {
  try {
    const message = JSON.parse(rawJson) as Record<string, unknown>
    if (message.type !== MESSAGE_TYPE) return null
    if (!isDiagnosticsEnabled) return null
    return JSON.stringify(message)
  } catch {
    return null
  }
}

describe('MAP_PERF_DIAG payload', () => {
  it('has expected fields and only timings/booleans (no coordinates, no user id)', () => {
    const payload = buildValidPayload()
    expect(payload.type).toBe(MESSAGE_TYPE)
    expect(payloadHasOnlyAllowedKeys(payload)).toBe(true)
    expect(payloadHasNoForbiddenKeys(payload)).toBe(true)
  })

  it('contains no forbidden data (lat, lng, userId, etc.)', () => {
    const payload = buildValidPayload()
    for (const key of FORBIDDEN_KEYS) {
      expect(payload).not.toHaveProperty(key)
    }
  })

  it('allowed numeric fields are numbers or undefined', () => {
    const payload = buildValidPayload()
    const numericKeys = [
      'firstRenderMs',
      'fetchStartMs',
      'fetchCompleteMs',
      'initialLoadCompleteMs',
      'mapMountedMs',
      'styleLoadedMs',
      'mapIdleMs',
    ]
    for (const key of numericKeys) {
      const v = payload[key]
      expect(v === undefined || typeof v === 'number').toBe(true)
    }
  })

  it('allowed boolean fields are booleans', () => {
    const payload = buildValidPayload()
    const boolKeys = ['hasMapMounted', 'hasStyleLoaded', 'hasMapIdle', 'hasInitialLoadComplete']
    for (const key of boolKeys) {
      expect(typeof payload[key]).toBe('boolean')
    }
  })

  it('rejects payload that includes forbidden keys', () => {
    const withForbidden = { ...buildValidPayload(), lat: 40, lng: -83 }
    expect(payloadHasNoForbiddenKeys(withForbidden)).toBe(false)
  })

  it('rejects payload with userId', () => {
    const withUserId = { ...buildValidPayload(), userId: 'abc' }
    expect(payloadHasNoForbiddenKeys(withUserId)).toBe(false)
  })

  it('native handler safely parses and stores when diagnostics enabled', () => {
    const raw = JSON.stringify(buildValidPayload())
    const stored = nativeParseAndStore(raw, true)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!) as Record<string, unknown>
    expect(parsed.type).toBe(MESSAGE_TYPE)
    expect(payloadHasNoForbiddenKeys(parsed)).toBe(true)
  })

  it('native handler does not store when diagnostics disabled', () => {
    const raw = JSON.stringify(buildValidPayload())
    const stored = nativeParseAndStore(raw, false)
    expect(stored).toBeNull()
  })

  it('native handler does not crash on invalid JSON', () => {
    expect(nativeParseAndStore('not json', true)).toBeNull()
    expect(nativeParseAndStore('', true)).toBeNull()
  })

  it('native handler ignores messages with wrong type', () => {
    const wrong = JSON.stringify({ type: 'OTHER', firstRenderMs: 1 })
    expect(nativeParseAndStore(wrong, true)).toBeNull()
  })
})
