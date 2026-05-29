import type { CookieOptions } from '@supabase/ssr'
import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js'

/** OTP types accepted for verifyOtp on the auth callback (fail closed on unknown types). */
export const ALLOWED_VERIFY_OTP_TYPES = [
  'signup',
  'email',
  'magiclink',
  'invite',
  'email_change',
  'recovery',
] as const

export type AllowedVerifyOtpType = (typeof ALLOWED_VERIFY_OTP_TYPES)[number]

export function isAllowedVerifyOtpType(value: string | null): value is AllowedVerifyOtpType {
  if (!value) return false
  return (ALLOWED_VERIFY_OTP_TYPES as readonly string[]).includes(value)
}

export function decodeRedirectParam(redirectTo: string): string {
  try {
    const decodedOnce = decodeURIComponent(redirectTo)
    if (decodedOnce.includes('%')) {
      return decodeURIComponent(decodedOnce)
    }
    return decodedOnce
  } catch {
    return redirectTo
  }
}

export function resolveRedirectTo(searchParams: URLSearchParams): string {
  const raw = searchParams.get('redirectTo') || searchParams.get('next')
  if (!raw) return '/sales'
  return decodeRedirectParam(raw)
}

/**
 * Sanitize post-auth redirect: relative paths only; never land on auth pages (loop prevention).
 */
export function sanitizeAuthRedirect(redirectTo: string, origin: string): string {
  let finalRedirectTo = redirectTo

  if (!finalRedirectTo.startsWith('/')) {
    finalRedirectTo = '/sales'
  }

  if (
    finalRedirectTo.startsWith('/auth/') ||
    finalRedirectTo.startsWith('/login') ||
    finalRedirectTo.startsWith('/signin')
  ) {
    finalRedirectTo = '/sales'
  }

  try {
    const testUrl = new URL(finalRedirectTo, origin)
    if (testUrl.origin !== new URL(origin).origin) {
      finalRedirectTo = '/sales'
    }
  } catch {
    // Relative paths only
  }

  return finalRedirectTo
}

export function buildAuthSuccessRedirectUrl(
  finalRedirectTo: string,
  origin: string
): URL {
  const [path, queryString] = finalRedirectTo.split('?')
  const redirectUrl = new URL(path, origin)
  if (queryString) {
    const params = new URLSearchParams(queryString)
    params.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value)
    })
  }
  redirectUrl.searchParams.delete('code')
  redirectUrl.searchParams.delete('error')
  redirectUrl.searchParams.delete('token_hash')
  redirectUrl.searchParams.delete('type')
  return redirectUrl
}

export async function ensureUserProfile(origin: string, cookieHeader: string): Promise<void> {
  try {
    const profileResponse = await fetch(new URL('/api/profile', origin), {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    })
    if (!profileResponse.ok && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH_CALLBACK] Profile creation failed, but continuing', {
        status: profileResponse.status,
      })
    }
  } catch {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH_CALLBACK] Profile creation error, but continuing')
    }
  }
}

export type AuthCallbackSuccess = {
  kind: 'session'
  redirectUrl: URL
}

export type AuthCallbackFailure = {
  kind: 'error'
  errorCode: string
}

export type AuthCallbackDelegate = {
  kind: 'delegate_hash'
  finishUrl: URL
}

export type AuthCallbackResult = AuthCallbackSuccess | AuthCallbackFailure | AuthCallbackDelegate

export async function completeAuthCallbackFromRequest(
  supabase: SupabaseClient,
  searchParams: URLSearchParams,
  origin: string,
  cookieHeader: string
): Promise<AuthCallbackResult> {
  const redirectTo = resolveRedirectTo(searchParams)
  const finalRedirectTo = sanitizeAuthRedirect(redirectTo, origin)

  const code = searchParams.get('code')
  const oauthError = searchParams.get('error')
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type')
  const accessToken = searchParams.get('access_token')
  const refreshToken = searchParams.get('refresh_token')

  if (oauthError) {
    return { kind: 'error', errorCode: oauthError }
  }

  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return { kind: 'error', errorCode: exchangeError.message }
    }
    if (!data.session) {
      return { kind: 'error', errorCode: 'no_session' }
    }
    await ensureUserProfile(origin, cookieHeader)
    return {
      kind: 'session',
      redirectUrl: buildAuthSuccessRedirectUrl(finalRedirectTo, origin),
    }
  }

  if (tokenHash) {
    if (!isAllowedVerifyOtpType(otpType)) {
      return { kind: 'error', errorCode: 'invalid_callback' }
    }
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as EmailOtpType,
    })
    if (verifyError) {
      return { kind: 'error', errorCode: 'verify_failed' }
    }
    if (!data.session) {
      return { kind: 'error', errorCode: 'no_session' }
    }
    await ensureUserProfile(origin, cookieHeader)
    return {
      kind: 'session',
      redirectUrl: buildAuthSuccessRedirectUrl(finalRedirectTo, origin),
    }
  }

  if (accessToken && refreshToken) {
    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (sessionError || !data.session) {
      return { kind: 'error', errorCode: 'invalid_session' }
    }
    await ensureUserProfile(origin, cookieHeader)
    return {
      kind: 'session',
      redirectUrl: buildAuthSuccessRedirectUrl(finalRedirectTo, origin),
    }
  }

  // Hash-fragment tokens are not visible to the server — delegate to client finish page.
  const finishUrl = new URL('/auth/callback/finish', origin)
  const rawRedirect = searchParams.get('redirectTo') || searchParams.get('next')
  if (rawRedirect) {
    finishUrl.searchParams.set('redirectTo', rawRedirect)
  }
  return { kind: 'delegate_hash', finishUrl }
}

export function createAuthCallbackCookieHandlers(
  cookieStore: {
    getAll: () => { name: string; value: string }[]
    set: (options: {
      name: string
      value: string
      path?: string
      sameSite?: 'lax' | 'strict' | 'none'
      secure?: boolean
      httpOnly?: boolean
      maxAge?: number
      expires?: Date
    }) => void
  },
  isHttps: boolean
) {
  return {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set({
            name,
            value,
            ...options,
            path: options?.path || '/',
            sameSite: options?.sameSite || 'lax',
            secure: options?.secure !== undefined ? options.secure : isHttps,
            httpOnly: options?.httpOnly !== undefined ? options.httpOnly : true,
          })
        })
      } catch {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AUTH_CALLBACK] Cookie setting failed')
        }
      }
    },
  }
}
