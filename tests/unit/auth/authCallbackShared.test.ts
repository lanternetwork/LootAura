import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  completeAuthCallbackFromRequest,
  isAllowedVerifyOtpType,
  sanitizeAuthRedirect,
} from '@/lib/auth/authCallbackShared'

vi.mock('@/lib/profile/ensureLootauraProfile', () => ({
  ensureLootauraProfileExists: vi.fn().mockResolvedValue({ ok: true, created: true }),
}))

describe('authCallbackShared', () => {
  describe('isAllowedVerifyOtpType', () => {
    it('allows signup and recovery', () => {
      expect(isAllowedVerifyOtpType('signup')).toBe(true)
      expect(isAllowedVerifyOtpType('recovery')).toBe(true)
      expect(isAllowedVerifyOtpType('invalid')).toBe(false)
    })
  })

  describe('sanitizeAuthRedirect', () => {
    it('blocks auth page redirects', () => {
      expect(sanitizeAuthRedirect('/auth/signin', 'https://example.com')).toBe('/sales')
    })

    it('allows safe paths', () => {
      expect(sanitizeAuthRedirect('/favorites', 'https://example.com')).toBe('/favorites')
    })
  })

  describe('completeAuthCallbackFromRequest', () => {
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: vi.fn(),
        verifyOtp: vi.fn(),
        setSession: vi.fn(),
      },
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('exchanges PKCE code', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'u1' } } },
        error: null,
      })

      const params = new URLSearchParams({ code: 'pkce-code' })
      const result = await completeAuthCallbackFromRequest(
        mockSupabase as any,
        params,
        'https://example.com'
      )

      expect(result.kind).toBe('session')
      if (result.kind === 'session') {
        expect(result.redirectUrl.pathname).toBe('/sales')
      }
      expect(mockSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code')
    })

    it('verifies email signup token_hash', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: { user: { id: 'u1' } } },
        error: null,
      })

      const params = new URLSearchParams({
        token_hash: 'hash123',
        type: 'signup',
      })
      const result = await completeAuthCallbackFromRequest(
        mockSupabase as any,
        params,
        'https://example.com'
      )

      expect(result.kind).toBe('session')
      expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'hash123',
        type: 'signup',
      })
    })

    it('sets session from query tokens', async () => {
      mockSupabase.auth.setSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'u1' } } },
        error: null,
      })

      const params = new URLSearchParams({
        access_token: 'at',
        refresh_token: 'rt',
      })
      const result = await completeAuthCallbackFromRequest(
        mockSupabase as any,
        params,
        'https://example.com'
      )

      expect(result.kind).toBe('session')
      expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
        access_token: 'at',
        refresh_token: 'rt',
      })
    })

    it('delegates to client finish when no server-visible credentials', async () => {
      const params = new URLSearchParams()
      const result = await completeAuthCallbackFromRequest(
        mockSupabase as any,
        params,
        'https://example.com'
      )

      expect(result.kind).toBe('delegate_hash')
      if (result.kind === 'delegate_hash') {
        expect(result.finishUrl.pathname).toBe('/auth/callback/finish')
      }
    })

    it('fails closed on invalid otp type', async () => {
      const params = new URLSearchParams({
        token_hash: 'hash123',
        type: 'unknown',
      })
      const result = await completeAuthCallbackFromRequest(
        mockSupabase as any,
        params,
        'https://example.com'
      )

      expect(result).toEqual({ kind: 'error', errorCode: 'invalid_callback' })
    })

    it('fails closed on oauth error param', async () => {
      const params = new URLSearchParams({ error: 'access_denied' })
      const result = await completeAuthCallbackFromRequest(
        mockSupabase as any,
        params,
        'https://example.com'
      )

      expect(result).toEqual({ kind: 'error', errorCode: 'access_denied' })
    })
  })
})
