import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { authDebug } from '@/lib/debug/authDebug'
import {
  completeAuthCallbackFromRequest,
  createAuthCallbackCookieHandlers,
} from '@/lib/auth/authCallbackShared'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function callbackHandler(request: NextRequest) {
  try {
    const url = new URL(request.url)

    authDebug.logAuthFlow('oauth-callback', 'start', 'start', {
      hasCode: !!url.searchParams.get('code'),
      hasError: !!url.searchParams.get('error'),
      hasTokenHash: !!url.searchParams.get('token_hash'),
    })

    const cookieStore = await cookies()
    const forwardedProto = request.headers.get('x-forwarded-proto')
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

    const result = await completeAuthCallbackFromRequest(
      supabase,
      url.searchParams,
      url.origin,
      request.headers.get('cookie') || ''
    )

    if (result.kind === 'error') {
      authDebug.logAuthFlow('oauth-callback', 'error', 'error', {
        error: result.errorCode,
      })
      return NextResponse.redirect(
        new URL(`/auth/error?error=${encodeURIComponent(result.errorCode)}`, url.origin)
      )
    }

    if (result.kind === 'delegate_hash') {
      authDebug.logAuthFlow('oauth-callback', 'delegate-hash', 'success')
      return NextResponse.redirect(result.finishUrl)
    }

    authDebug.logAuthFlow('oauth-callback', 'success', 'success')
    return NextResponse.redirect(result.redirectUrl)
  } catch (error) {
    authDebug.logAuthFlow('oauth-callback', 'unexpected-error', 'error', {
      error: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.redirect(
      new URL('/auth/error?error=exchange_failed', request.url)
    )
  }
}

export const GET = withRateLimit(callbackHandler, [
  Policies.AUTH_CALLBACK,
  Policies.AUTH_HOURLY,
])
