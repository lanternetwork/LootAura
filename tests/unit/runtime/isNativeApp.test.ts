/**
 * Unit tests for server-side in-app detection (isInAppUserAgent).
 */

import { describe, it, expect } from 'vitest'
import { isInAppUserAgent, getInAppUaToken } from '@/lib/runtime/isNativeApp'

describe('isInAppUserAgent', () => {
  const IN_APP_UA = `Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 ${getInAppUaToken()} Chrome/91.0`

  it('returns true when user-agent contains in-app token', () => {
    expect(isInAppUserAgent(IN_APP_UA)).toBe(true)
    expect(isInAppUserAgent('LootAuraInApp/1.0')).toBe(true)
    expect(isInAppUserAgent('foo LootAuraInApp/1.0 bar')).toBe(true)
  })

  it('returns false when user-agent does not contain token', () => {
    expect(isInAppUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0')).toBe(false)
    expect(isInAppUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(false)
    expect(isInAppUserAgent('')).toBe(false)
  })

  it('returns false for null or non-string', () => {
    expect(isInAppUserAgent(null)).toBe(false)
    expect(isInAppUserAgent(undefined as any)).toBe(false)
  })
})
