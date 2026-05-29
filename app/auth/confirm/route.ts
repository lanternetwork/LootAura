import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { RECOVERY_RESET_PATH } from '@/lib/auth/authRecovery'
import { completeAuthOtpConfirmFromRequest } from '@/lib/auth/authOtpConfirm'
import {
  createAuthCallbackCookieHandlers,
} from '@/lib/auth/authCallbackShared'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const correlationId = Math.random().toString(36).substring(2, 15)
  const otpType = url.searchParams.get('type')

  console.log('[AUTH_CONFIRM] Processing OTP confirm:', {
    hasTokenHash: !!url.searchParams.get('token_hash'),
    type: otpType,
    hasNext: !!url.searchParams.get('next'),
    pathname: url.pathname,
    requestId: correlationId,
  })

  const cookieStore = await cookies()
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const isHttps =
    url.protocol === 'https:' ||
    forwardedProto === 'https' ||
    process.env.NODE_ENV === 'production'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: createAuthCallbackCookieHandlers(cookieStore, isHttps),
      auth: {
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )

  const defaultRedirect =
    otpType === 'recovery' ? RECOVERY_RESET_PATH : '/sales'

  const result = await completeAuthOtpConfirmFromRequest(
    supabase,
    url.searchParams,
    url.origin,
    defaultRedirect
  )

  if (result.kind === 'error') {
    if (otpType === 'recovery' || url.searchParams.get('next') === RECOVERY_RESET_PATH) {
      const recoveryErrorUrl = new URL(RECOVERY_RESET_PATH, url.origin)
      recoveryErrorUrl.searchParams.set('error', result.errorCode)
      return NextResponse.redirect(recoveryErrorUrl)
    }
    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(result.errorCode)}`, url.origin)
    )
  }

  console.log('[AUTH_CONFIRM] Session established, redirecting', {
    pathname: url.pathname,
    requestId: correlationId,
  })
  return NextResponse.redirect(result.redirectUrl)
}
