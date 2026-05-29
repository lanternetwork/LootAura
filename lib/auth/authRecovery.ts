/**
 * Password recovery routing — delegates auth completion to /auth/callback
 * instead of parsing PKCE/hash/token formats on the reset page.
 */

export const RECOVERY_RESET_PATH = '/auth/reset-password'

const AUTH_CALLBACK_PATH = '/auth/callback'
const AUTH_CALLBACK_FINISH_PATH = '/auth/callback/finish'

const PASSTHROUGH_CALLBACK_PARAMS = [
  'code',
  'token_hash',
  'type',
  'access_token',
  'refresh_token',
] as const

/** Redirect target for resetPasswordForEmail — completes via centralized callback. */
export function buildRecoveryEmailRedirectTo(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '')
  const redirectTo = encodeURIComponent(RECOVERY_RESET_PATH)
  return `${base}${AUTH_CALLBACK_PATH}?redirectTo=${redirectTo}`
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

/** Supabase error query on landing URL — handle locally, do not forward to callback. */
export function parseRecoveryAuthError(searchParams: URLSearchParams): string | null {
  const error = searchParams.get('error')
  if (!error) return null

  const errorCode = searchParams.get('error_code') ?? ''
  const description = searchParams.get('error_description') ?? ''

  if (errorCode === 'otp_expired' || description.toLowerCase().includes('expired')) {
    return 'This password reset link has expired. Please request a new one.'
  }

  if (error === 'access_denied') {
    return 'This password reset link is no longer valid. Please request a new one.'
  }

  return 'We could not verify your reset link. Please request a new one.'
}

/** True when URL should be handled by /auth/callback (server can exchange session). */
export function shouldDelegateToAuthCallback(searchParams: URLSearchParams): boolean {
  if (searchParams.get('error')) return false
  if (searchParams.get('code')) return true
  if (searchParams.get('token_hash') && searchParams.get('type')) return true
  if (searchParams.get('access_token') && searchParams.get('refresh_token')) return true
  return false
}

export function buildAuthCallbackDelegationUrl(
  origin: string,
  searchParams: URLSearchParams
): string {
  const url = new URL(AUTH_CALLBACK_PATH, origin)
  for (const key of PASSTHROUGH_CALLBACK_PARAMS) {
    const value = searchParams.get(key)
    if (value) url.searchParams.set(key, value)
  }
  url.searchParams.set('redirectTo', RECOVERY_RESET_PATH)
  return url.toString()
}

/** Hash-fragment tokens must use client finish page (same establish-session path as signup). */
export function buildAuthCallbackFinishDelegationUrl(origin: string): string {
  const url = new URL(AUTH_CALLBACK_FINISH_PATH, origin)
  url.searchParams.set('redirectTo', RECOVERY_RESET_PATH)
  return url.pathname + url.search
}
