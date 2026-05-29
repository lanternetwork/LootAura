import { describe, it, expect } from 'vitest'
import {
  buildRecoveryConfirmUrlTemplate,
  buildRecoveryEmailRedirectTo,
  isLegacyPkceRecoveryLink,
  isRecoveryRedirectTarget,
  parseRecoveryAuthError,
} from '@/lib/auth/authRecovery'

describe('authRecovery', () => {
  describe('buildRecoveryEmailRedirectTo', () => {
    it('allowlists reset password path for resetPasswordForEmail', () => {
      expect(buildRecoveryEmailRedirectTo('https://lootaura.com')).toBe(
        'https://lootaura.com/auth/reset-password'
      )
    })
  })

  describe('buildRecoveryConfirmUrlTemplate', () => {
    it('documents OTP confirm link for Supabase email template', () => {
      expect(buildRecoveryConfirmUrlTemplate('https://lootaura.com')).toBe(
        'https://lootaura.com/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=%2Fauth%2Freset-password'
      )
    })
  })

  describe('isLegacyPkceRecoveryLink', () => {
    it('detects PKCE code query on reset page', () => {
      expect(isLegacyPkceRecoveryLink(new URLSearchParams('code=abc'))).toBe(true)
      expect(isLegacyPkceRecoveryLink(new URLSearchParams())).toBe(false)
    })
  })

  describe('parseRecoveryAuthError', () => {
    it('returns legacy message for ?code= links', () => {
      const params = new URLSearchParams('code=pkce-code')
      expect(parseRecoveryAuthError(params)).toContain('older format')
    })

    it('returns legacy message for PKCE verifier errors', () => {
      const params = new URLSearchParams(
        'error=PKCE+code+verifier+not+found+in+storage'
      )
      expect(parseRecoveryAuthError(params)).toContain('older format')
    })

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
