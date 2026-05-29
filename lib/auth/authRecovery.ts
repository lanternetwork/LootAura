/**
 * Password recovery routing — OTP confirm via /auth/confirm (no PKCE verifier).
 */

export const RECOVERY_RESET_PATH = '/auth/reset-password'

const AUTH_CALLBACK_FINISH_PATH = '/auth/callback/finish'

/** Allowlist target for resetPasswordForEmail (email template builds the confirm link). */
export function buildRecoveryEmailRedirectTo(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '')
  return `${base}${RECOVERY_RESET_PATH}`
}

/** Documented shape for Supabase reset-password email template (Dashboard). */
export function buildRecoveryConfirmUrlTemplate(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '')
  const next = encodeURIComponent(RECOVERY_RESET_PATH)
  return `${base}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=${next}`
}

export function isRecoveryRedirectTarget(redirectTo: string | null | undefined): boolean {
  if (!redirectTo) return false
  try {
    const decoded = decodeURIComponent(redirectTo)
    return decoded === RECOVERY_RESET_PATH || decoded.startsWith(`${RECOVERY_RESET_PATH}?`)
  } catch {
    return redirectTo === RECOVERY_RESET_PATH
  }
}

/** Legacy reset emails that used PKCE ?code= via ConfirmationURL. */
export function isLegacyPkceRecoveryLink(searchParams: URLSearchParams): boolean {
  return searchParams.has('code')
}

export function parseRecoveryAuthError(searchParams: URLSearchParams): string | null {
  if (isLegacyPkceRecoveryLink(searchParams)) {
    return 'This reset link uses an older format. Please request a new password reset email.'
  }

  const error = searchParams.get('error')
  if (!error) return null

  const errorCode = searchParams.get('error_code') ?? ''
  const description = searchParams.get('error_description') ?? ''
  const normalized = error.toLowerCase()

  if (
    normalized.includes('pkce') ||
    normalized.includes('code verifier') ||
    errorCode === 'otp_expired' ||
    description.toLowerCase().includes('expired')
  ) {
    if (normalized.includes('pkce') || normalized.includes('code verifier')) {
      return 'This reset link uses an older format. Please request a new password reset email.'
    }
    return 'This password reset link has expired. Please request a new one.'
  }

  if (error === 'access_denied') {
    return 'This password reset link is no longer valid. Please request a new one.'
  }

  if (error === 'missing_otp_params' || error === 'verify_failed' || error === 'invalid_callback') {
    return 'We could not verify your reset link. Please request a new one.'
  }

  return 'We could not verify your reset link. Please request a new one.'
}

/** Hash-fragment tokens use client finish page (establish-session path). */
export function buildAuthCallbackFinishDelegationUrl(origin: string): string {
  const url = new URL(AUTH_CALLBACK_FINISH_PATH, origin)
  url.searchParams.set('redirectTo', RECOVERY_RESET_PATH)
  return url.pathname + url.search
}
