import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { cookies } from 'next/headers'
import { authDebug } from '@/lib/debug/authDebug'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function callbackHandler(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    
    // Read redirectTo from query parameters (preserved by Supabase's redirectTo mechanism)
    let redirectTo = url.searchParams.get('redirectTo') || url.searchParams.get('next')
    
    // Decode the redirectTo if it was URL-encoded (handles encoding from OAuth flow)
    if (redirectTo) {
      try {
        // Keep decoding until no more % signs remain (handles double/triple encoding)
        let decoded = redirectTo
        let previousDecoded = ''
        while (decoded !== previousDecoded && decoded.includes('%')) {
          previousDecoded = decoded
          decoded = decodeURIComponent(decoded)
        }
        redirectTo = decoded
      } catch (e) {
        // If decoding fails, use as-is
      }
    }
    
    authDebug.logAuthFlow('oauth-callback', 'start', 'start', {
      hasCode: !!code,
      hasError: !!error
    })

    if (error) {
      authDebug.logAuthFlow('oauth-callback', 'oauth-error', 'error', { hasError: true })
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
      
      // Determine final redirect destination
      if (!redirectTo) {
        // No redirect specified - use safe default
        redirectTo = '/sales'
        authDebug.logAuthFlow('oauth-callback', 'no-redirect', 'success', {
          message: 'No redirectTo in query params, using default /sales'
        })
      }
      
      // Prevent redirect loops: never redirect to auth pages
      const finalRedirectTo = redirectTo.startsWith('/auth/') || redirectTo.startsWith('/login') || redirectTo.startsWith('/signin')
        ? '/sales'
        : redirectTo
      
      authDebug.logAuthFlow('oauth-callback', 'redirect', 'success', { hasRedirect: true })
      return NextResponse.redirect(new URL(finalRedirectTo, url.origin))
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
