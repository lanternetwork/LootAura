import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  completeAuthOtpConfirmFromRequest,
  resolveOtpConfirmRedirect,
} from '@/lib/auth/authOtpConfirm'

const mockSupabase = {
  auth: {
    verifyOtp: vi.fn(),
  },
}

const mockEnsureProfile = vi.fn().mockResolvedValue({ ok: true, created: true })

vi.mock('@/lib/profile/ensureLootauraProfile', () => ({
  ensureLootauraProfileExists: (...args: unknown[]) => mockEnsureProfile(...args),
}))

describe('authOtpConfirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveOtpConfirmRedirect', () => {
    it('prefers next over default', () => {
      const params = new URLSearchParams('next=%2Ffavorites')
      expect(resolveOtpConfirmRedirect(params, '/sales')).toBe('/favorites')
    })

    it('falls back to default when no next', () => {
      expect(resolveOtpConfirmRedirect(new URLSearchParams(), '/auth/reset-password')).toBe(
        '/auth/reset-password'
      )
    })
  })

  describe('completeAuthOtpConfirmFromRequest', () => {
    it('returns missing_otp_params when token_hash absent', async () => {
      const result = await completeAuthOtpConfirmFromRequest(
        mockSupabase as never,
        new URLSearchParams('type=recovery'),
        'https://example.com',
        '/auth/reset-password'
      )
      expect(result).toEqual({ kind: 'error', errorCode: 'missing_otp_params' })
    })

    it('returns invalid_callback for disallowed type', async () => {
      const result = await completeAuthOtpConfirmFromRequest(
        mockSupabase as never,
        new URLSearchParams('token_hash=abc&type=not_allowed'),
        'https://example.com',
        '/sales'
      )
      expect(result).toEqual({ kind: 'error', errorCode: 'invalid_callback' })
    })

    it('verifies recovery OTP and redirects to reset password', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: { user: { id: 'u1' } } },
        error: null,
      })

      const params = new URLSearchParams(
        'token_hash=hash123&type=recovery&next=%2Fauth%2Freset-password'
      )
      const result = await completeAuthOtpConfirmFromRequest(
        mockSupabase as never,
        params,
        'https://example.com',
        '/auth/reset-password'
      )

      expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'hash123',
        type: 'recovery',
      })
      expect(mockEnsureProfile).toHaveBeenCalled()
      expect(result.kind).toBe('session')
      if (result.kind === 'session') {
        expect(result.redirectUrl.pathname).toBe('/auth/reset-password')
      }
    })

    it('returns verify_failed when verifyOtp errors', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValueOnce({
        data: null,
        error: { message: 'Token has expired' },
      })

      const result = await completeAuthOtpConfirmFromRequest(
        mockSupabase as never,
        new URLSearchParams('token_hash=bad&type=recovery'),
        'https://example.com',
        '/auth/reset-password'
      )

      expect(result).toEqual({ kind: 'error', errorCode: 'verify_failed' })
    })

    it('returns no_session when verifyOtp succeeds without session', async () => {
      mockSupabase.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      })

      const result = await completeAuthOtpConfirmFromRequest(
        mockSupabase as never,
        new URLSearchParams('token_hash=abc&type=recovery'),
        'https://example.com',
        '/auth/reset-password'
      )

      expect(result).toEqual({ kind: 'error', errorCode: 'no_session' })
    })
  })
})
