import { describe, it, expect } from 'vitest'
import {
  parseAuthTokensFromHash,
  parseAuthTokensFromSearch,
} from '@/lib/auth/parseAuthFragment'

describe('parseAuthFragment', () => {
  it('parses access_token and refresh_token from hash', () => {
    const hash =
      '#access_token=at123&refresh_token=rt456&type=signup&expires_in=3600'
    expect(parseAuthTokensFromHash(hash)).toEqual({
      access_token: 'at123',
      refresh_token: 'rt456',
      type: 'signup',
    })
  })

  it('returns null when hash missing tokens', () => {
    expect(parseAuthTokensFromHash('#type=signup')).toBeNull()
    expect(parseAuthTokensFromHash('')).toBeNull()
  })

  it('parses tokens from query string', () => {
    const search = '?access_token=at&refresh_token=rt'
    expect(parseAuthTokensFromSearch(search)).toEqual({
      access_token: 'at',
      refresh_token: 'rt',
    })
  })
})
