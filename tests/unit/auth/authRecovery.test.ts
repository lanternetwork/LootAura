import { describe, it, expect } from 'vitest'
import {
  buildAuthCallbackDelegationUrl,
  buildRecoveryEmailRedirectTo,
  isRecoveryRedirectTarget,
  parseRecoveryAuthError,
  shouldDelegateToAuthCallback,
} from '@/lib/auth/authRecovery'

describe('authRecovery', () => {
  describe('buildRecoveryEmailRedirectTo', () => {
    it('routes email through centralized callback with reset redirect', () => {
      expect(buildRecoveryEmailRedirectTo('https://lootaura.com')).toBe(
        'https://lootaura.com/auth/callback?redirectTo=%2Fauth%2Freset-password'
      )
    })
  })

  describe('shouldDelegateToAuthCallback', () => {
    it('delegates PKCE code', () => {
      const params = new URLSearchParams('code=abc123')
      expect(shouldDelegateToAuthCallback(params)).toBe(true)
    })

    it('delegates token_hash recovery', () => {
      const params = new URLSearchParams('token_hash=hash&type=recovery')
      expect(shouldDelegateToAuthCallback(params)).toBe(true)
    })

    it('does not delegate Supabase error query', () => {
      const params = new URLSearchParams('error=access_denied&error_code=otp_expired')
      expect(shouldDelegateToAuthCallback(params)).toBe(false)
    })
  })

  describe('buildAuthCallbackDelegationUrl', () => {
    it('preserves code and sets recovery redirect', () => {
      const params = new URLSearchParams('code=pkce-code')
      const url = buildAuthCallbackDelegationUrl('https://lootaura.com', params)
      expect(url).toBe(
        'https://lootaura.com/auth/callback?code=pkce-code&redirectTo=%2Fauth%2Freset-password'
      )
    })
  })

  describe('parseRecoveryAuthError', () => {
    it('returns expired message for otp_expired', () => {
      const params = new URLSearchParams('error=access_denied&error_code=otp_expired')
      expect(parseRecoveryAuthError(params)).toContain('expired')
    })

    it('returns null when no error', () => {
      expect(parseRecoveryAuthError(new URLSearchParams())).toBeNull()
    })
  })

  describe('isRecoveryRedirectTarget', () => {
    it('matches reset password path', () => {
      expect(isRecoveryRedirectTarget('/auth/reset-password')).toBe(true)
      expect(isRecoveryRedirectTarget('/sales')).toBe(false)
    })
  })
})
