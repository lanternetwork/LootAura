import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { cookies } from 'next/headers'
import { authDebug } from '@/lib/debug/authDebug'

export const dynamic = 'force-dynamic'

async function callbackHandler(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const next = url.searchParams.get('next') || '/sales'

    authDebug.logAuthFlow('oauth-callback', 'start', 'start', {
      hasCode: !!code,
      hasError: !!error,
      next
    })

    if (error) {
      authDebug.logAuthFlow('oauth-callback', 'oauth-error', 'error', { error })
      return NextResponse.redirect(new URL(`/auth/error?error=${error}`, url.origin))
    }

    if (!code) {
      authDebug.logAuthFlow('oauth-callback', 'no-code', 'error')
      return NextResponse.redirect(new URL('/auth/error?error=missing_code', url.origin))
    }

    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Exchange code for session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      authDebug.logAuthFlow('oauth-callback', 'exchange-error', 'error', { error: exchangeError.message })
      return NextResponse.redirect(new URL(`/auth/error?error=${exchangeError.message}`, url.origin))
    }

    if (data.session) {
      authDebug.logAuthFlow('oauth-callback', 'success', 'success', {
        userId: data.session.user.id,
        email: data.session.user.email
      })

      // Ensure profile exists for the user (idempotent)
      try {
        const profileResponse = await fetch(new URL('/api/profile', url.origin), {
          method: 'POST',
          headers: {
            'Cookie': request.headers.get('cookie') || '',
          },
        })

        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          authDebug.logAuthFlow('oauth-callback', 'profile-ensured', 'success', {
            created: profileData.created,
            userId: data.session.user.id
          })
        } else {
          authDebug.logAuthFlow('oauth-callback', 'profile-failed', 'error', {
            status: profileResponse.status,
            userId: data.session.user.id
          })
        }
      } catch (profileError) {
        authDebug.logAuthFlow('oauth-callback', 'profile-error', 'error', {
          error: profileError instanceof Error ? profileError.message : 'unknown',
          userId: data.session.user.id
        })
        // Don't fail the auth flow if profile creation fails
      }

      // Success: user session cookies are automatically set by auth-helpers
      authDebug.logAuthFlow('oauth-callback', 'redirect', 'success', { next })
      return NextResponse.redirect(new URL(next, url.origin))
    }

    authDebug.logAuthFlow('oauth-callback', 'no-session', 'error')
    return NextResponse.redirect(new URL('/auth/error?error=no_session', url.origin))

  } catch (error) {
    authDebug.logAuthFlow('oauth-callback', 'unexpected-error', 'error', {
      error: error instanceof Error ? error.message : 'unknown'
    })
    return NextResponse.redirect(new URL('/auth/error?error=unexpected_error', request.url))
  }
}

export const GET = withRateLimit(callbackHandler, [
  Policies.AUTH_CALLBACK,
  Policies.AUTH_HOURLY
])
