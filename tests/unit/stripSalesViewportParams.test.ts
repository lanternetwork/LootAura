/**
 * Unit tests for stripSalesViewportParams (native shell URL sanitization).
 * Ensures only lat/lng/zoom are removed and only for path exactly /sales.
 */

import { describe, it, expect } from 'vitest'
import { stripSalesViewportParams } from '@/lib/url/stripSalesViewportParams'

describe('stripSalesViewportParams', () => {
  it('strips lat, lng, zoom from /sales only', () => {
    const url = 'https://lootaura.com/sales?lat=39.96&lng=-83&zoom=10'
    expect(stripSalesViewportParams(url)).toBe('https://lootaura.com/sales')
  })

  it('preserves other query params on /sales', () => {
    const url = 'https://lootaura.com/sales?lat=40&lng=-90&zip=43081&dist=25'
    const out = stripSalesViewportParams(url)
    expect(out).toContain('sales')
    expect(out).not.toMatch(/[?&]lat=/)
    expect(out).not.toMatch(/[?&]lng=/)
    expect(out).not.toMatch(/[?&]zoom=/)
    expect(out).toMatch(/zip=43081/)
    expect(out).toMatch(/dist=25/)
  })

  it('does not strip params from sale detail path', () => {
    const url = 'https://lootaura.com/sales/abc123?lat=40&lng=-90'
    expect(stripSalesViewportParams(url)).toBe(url)
  })

  it('does not strip params from other paths', () => {
    const url = 'https://lootaura.com/auth/callback?lat=40&code=xyz'
    expect(stripSalesViewportParams(url)).toBe(url)
  })

  it('leaves /sales with no viewport params unchanged', () => {
    const url = 'https://lootaura.com/sales?zip=43081'
    expect(stripSalesViewportParams(url)).toBe(url)
  })

  it('handles /sales with trailing slash as /sales', () => {
    const url = 'https://lootaura.com/sales/?lat=39&lng=-83'
    const out = stripSalesViewportParams(url)
    expect(out).not.toMatch(/[?&]lat=/)
    expect(out).not.toMatch(/[?&]lng=/)
  })

  it('returns original URL on parse failure', () => {
    const invalid = 'not-a-url'
    expect(stripSalesViewportParams(invalid)).toBe(invalid)
  })
})
