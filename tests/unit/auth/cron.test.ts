import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/log', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { assertCronAuthorized, isCronAuthorized } from '@/lib/auth/cron'

describe('cron auth bearer parsing', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'secret-with-space '
  })

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalSecret
    }
    vi.restoreAllMocks()
  })

  it('accepts bearer tokens when env secret has trailing whitespace', () => {
    const request = new NextRequest('https://example.com/api/cron/geocode', {
      headers: { authorization: 'Bearer secret-with-space' },
    })
    expect(isCronAuthorized(request)).toBe(true)
    expect(() => assertCronAuthorized(request)).not.toThrow()
  })

  it('rejects bearer tokens that do not match trimmed secret', () => {
    const request = new NextRequest('https://example.com/api/cron/geocode', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    expect(isCronAuthorized(request)).toBe(false)
    expect(() => assertCronAuthorized(request)).toThrow()
  })
})
