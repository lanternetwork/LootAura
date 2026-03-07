/**
 * Unit tests for Diagnostics Console ROUTE_STATE payload sanitization.
 * Ensures ROUTE_STATE events never store a raw query string (no leading ?)
 * and never include common token-like substrings (no PII/tokens in console).
 * Contract mirrors mobile/app/index.tsx buildRouteStateDiagPayload().
 */

import { describe, it, expect } from 'vitest'

/** Mirrors buildRouteStateDiagPayload in mobile/app/index.tsx - sanitized subset for diagnostics. */
function buildRouteStateDiagPayload(message: {
  pathname?: string
  search?: string
  isSaleDetail?: boolean
  saleId?: string | null
  inAppFlag?: boolean | null
  hasRNBridge?: boolean | null
}): Record<string, unknown> {
  const pathname = message.pathname || '/'
  const search = message.search
  const hasSearch = typeof search === 'string' && search.trim() !== ''
  return {
    pathname,
    isSaleDetail: message.isSaleDetail === true,
    saleId: message.saleId ?? null,
    inAppFlag: message.inAppFlag === true,
    hasRNBridge: message.hasRNBridge === true,
    ...(hasSearch ? { search: '[redacted]' as const } : {}),
  }
}

const TOKEN_LIKE_SUBSTRINGS = [
  'token=',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey=',
  'key=',
  'secret=',
  'auth=',
  'session=',
  'cookie=',
  'authorization',
  'bearer ',
  '?token',
  '?key',
  '?secret',
  '?auth',
]

function storedPayloadMustNotContain(storedJson: string): void {
  const lower = storedJson.toLowerCase()
  for (const sub of TOKEN_LIKE_SUBSTRINGS) {
    expect(lower).not.toContain(sub.toLowerCase())
  }
  // No raw query string: stored payload must not contain a leading ? inside a string value
  expect(storedJson).not.toMatch(/"\?/)
  // No query string fragment that could be a token (e.g. "?foo=bar" as value)
  expect(storedJson).not.toMatch(/\?[^"]*=/)
}

describe('Diagnostics Console ROUTE_STATE payload', () => {
  it('never stores raw search query string (no leading ?)', () => {
    const message = {
      pathname: '/sales',
      search: '?lat=40&lng=-83&utm_source=test',
      isSaleDetail: false,
      saleId: null,
      inAppFlag: true,
      hasRNBridge: true,
    }
    const payload = buildRouteStateDiagPayload(message)
    const stored = JSON.stringify(payload)
    expect(stored).not.toContain('?lat')
    expect(stored).not.toContain('utm_source')
    expect(stored).toContain('[redacted]')
    expect(stored).not.toMatch(/"\?/)
    storedPayloadMustNotContain(stored)
  })

  it('never includes token-like substrings when search contained tokens', () => {
    const message = {
      pathname: '/auth/callback',
      search: '?access_token=secret123&refresh_token=abc',
      isSaleDetail: false,
      saleId: null,
      inAppFlag: null,
      hasRNBridge: null,
    }
    const payload = buildRouteStateDiagPayload(message)
    const stored = JSON.stringify(payload)
    expect(stored).toContain('[redacted]')
    expect(stored).not.toContain('access_token')
    expect(stored).not.toContain('refresh_token')
    expect(stored).not.toContain('secret123')
    storedPayloadMustNotContain(stored)
  })

  it('omits search when empty (no query string)', () => {
    const message = {
      pathname: '/sales',
      search: '',
      isSaleDetail: false,
      saleId: null,
      inAppFlag: true,
      hasRNBridge: true,
    }
    const payload = buildRouteStateDiagPayload(message)
    expect(payload).not.toHaveProperty('search')
    const stored = JSON.stringify(payload)
    expect(stored).not.toContain('?')
    storedPayloadMustNotContain(stored)
  })

  it('includes only pathname, isSaleDetail, saleId, inAppFlag, hasRNBridge, and optional search redacted', () => {
    const message = {
      pathname: '/sales/abc-123',
      search: '?foo=bar',
      isSaleDetail: true,
      saleId: 'abc-123',
      inAppFlag: true,
      hasRNBridge: true,
    }
    const payload = buildRouteStateDiagPayload(message)
    expect(Object.keys(payload).sort()).toEqual([
      'hasRNBridge',
      'inAppFlag',
      'isSaleDetail',
      'pathname',
      'saleId',
      'search',
    ])
    expect(payload.search).toBe('[redacted]')
    expect(payload.pathname).toBe('/sales/abc-123')
    const stored = JSON.stringify(payload)
    storedPayloadMustNotContain(stored)
  })

  it('stored JSON contains no ? and no token-like substrings for any valid ROUTE_STATE shape', () => {
    const cases: Array<Record<string, unknown>> = [
      { pathname: '/', search: '?a=1&b=2' },
      { pathname: '/sales', search: '?token=xyz', isSaleDetail: false },
      { pathname: '/sales/id', search: '', isSaleDetail: true, saleId: 'id' },
      { pathname: '/profile', isSaleDetail: false, inAppFlag: true, hasRNBridge: true },
    ]
    for (const msg of cases) {
      const payload = buildRouteStateDiagPayload(msg as Parameters<typeof buildRouteStateDiagPayload>[0])
      const stored = JSON.stringify(payload)
      expect(stored).not.toMatch(/"\?/)
      storedPayloadMustNotContain(stored)
    }
  })
})
