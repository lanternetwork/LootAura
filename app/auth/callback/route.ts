import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  completeAuthCallbackFromRequest,
  createAuthCallbackCookieHandlers,
} from '@/lib/auth/authCallbackShared'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const correlationId = Math.random().toString(36).substring(2, 15)

  console.log('[AUTH_CALLBACK] Processing auth callback:', {
    hasCode: !!url.searchParams.get('code'),
    hasError: !!url.searchParams.get('error'),
    hasTokenHash: !!url.searchParams.get('token_hash'),
    hasQueryTokens: !!(
      url.searchParams.get('access_token') && url.searchParams.get('refresh_token')
    ),
    pathname: url.pathname,
    requestId: correlationId,
  })

  const cookieStore = await cookies()
  const protocol = url.protocol
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const isHttps =
    protocol === 'https:' ||
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
    url.origin
  )

  if (result.kind === 'error') {
    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(result.errorCode)}`, url.origin)
    )
  }

  if (result.kind === 'delegate_hash') {
    console.log('[AUTH_CALLBACK] Delegating to client finish (hash tokens)', {
      pathname: url.pathname,
      requestId: correlationId,
    })
    return NextResponse.redirect(result.finishUrl)
  }

  console.log('[AUTH_CALLBACK] Session established, redirecting', {
    pathname: url.pathname,
    requestId: correlationId,
  })
  return NextResponse.redirect(result.redirectUrl)
}
