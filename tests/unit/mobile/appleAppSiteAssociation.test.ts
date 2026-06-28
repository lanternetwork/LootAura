import { describe, expect, it } from 'vitest'

import { buildAppleAppSiteAssociation } from '@/lib/mobile/appleAppSiteAssociation'

describe('buildAppleAppSiteAssociation', () => {
  it('builds production appID and OAuth callback paths', () => {
    const payload = buildAppleAppSiteAssociation('ABCDE12345')
    expect(payload.applinks.details[0]?.appID).toBe('ABCDE12345.com.lootaura.app')
    expect(payload.applinks.details[0]?.paths).toEqual([
      '/auth/callback*',
      '/auth/native-callback*',
    ])
  })

  it('rejects empty team id', () => {
    expect(() => buildAppleAppSiteAssociation('')).toThrow(/APPLE_TEAM_ID/)
  })
})
