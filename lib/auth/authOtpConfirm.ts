import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js'
import { ensureLootauraProfileExists } from '@/lib/profile/ensureLootauraProfile'
import {
  buildAuthSuccessRedirectUrl,
  decodeRedirectParam,
  isAllowedVerifyOtpType,
  sanitizeAuthRedirect,
  type AuthCallbackFailure,
  type AuthCallbackSuccess,
} from '@/lib/auth/authCallbackShared'

export type AuthOtpConfirmResult = AuthCallbackSuccess | AuthCallbackFailure

export function resolveOtpConfirmRedirect(
  searchParams: URLSearchParams,
  defaultPath: string
): string {
  const raw = searchParams.get('next') || searchParams.get('redirectTo')
  if (!raw) return defaultPath
  return decodeRedirectParam(raw)
}

/**
 * Verify email OTP (token_hash + type) and establish session via SSR cookies.
 * Used by /auth/confirm and by /auth/callback for signup/magic-link token_hash links.
 */
export async function completeAuthOtpConfirmFromRequest(
  supabase: SupabaseClient,
  searchParams: URLSearchParams,
  origin: string,
  defaultRedirect: string
): Promise<AuthOtpConfirmResult> {
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type')

  if (!tokenHash || !otpType) {
    return { kind: 'error', errorCode: 'missing_otp_params' }
  }

  if (!isAllowedVerifyOtpType(otpType)) {
    return { kind: 'error', errorCode: 'invalid_callback' }
  }

  const redirectTo = resolveOtpConfirmRedirect(searchParams, defaultRedirect)
  const finalRedirectTo = sanitizeAuthRedirect(redirectTo, origin)

  const { data, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpType as EmailOtpType,
  })

  if (verifyError) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH_CONFIRM] verifyOtp failed', {
        event: 'otp_confirm',
        status: 'fail',
        code: verifyError.message,
        type: otpType,
      })
    }
    return { kind: 'error', errorCode: 'verify_failed' }
  }

  if (!data.session) {
    return { kind: 'error', errorCode: 'no_session' }
  }

  await ensureLootauraProfileExists()

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[AUTH_CONFIRM] verifyOtp ok', {
      event: 'otp_confirm',
      status: 'ok',
      type: otpType,
    })
  }

  return {
    kind: 'session',
    redirectUrl: buildAuthSuccessRedirectUrl(finalRedirectTo, origin),
  }
}
