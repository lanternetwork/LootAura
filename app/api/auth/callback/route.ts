import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { cookies } from 'next/headers'
import { authDebug } from '@/lib/debug/authDebug'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // Node.js runtime required for Buffer API used in state decoding

async function callbackHandler(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const state = url.searchParams.get('state')
    
    // Decode redirectTo from OAuth state parameter (primary source of truth for OAuth redirects)
    // State is base64-encoded JSON: { redirectTo: '/sell/new?resume=promotion' }
    let redirectTo: string | null = null
    
    if (state) {
      try {
        // Supabase may URL-encode the state parameter, so decode it first
        let decodedState = state
        try {
          decodedState = decodeURIComponent(state)
        } catch {
          // If URL decoding fails, use state as-is (might already be decoded)
          decodedState = state
        }
        
        // Decode base64 state to get JSON payload
        // Buffer is safe here because this route explicitly runs in Node.js runtime (see export const runtime above)
        const statePayload = JSON.parse(Buffer.from(decodedState, 'base64').toString('utf-8'))
        if (statePayload && typeof statePayload.redirectTo === 'string') {
          redirectTo = statePayload.redirectTo
          authDebug.logAuthFlow('oauth-callback', 'state-decoded', 'success', { redirectTo })
        }
      } catch (e) {
        // If state decoding fails, log but continue (fallback to query params or default)
        authDebug.logAuthFlow('oauth-callback', 'state-decode-error', 'error', { 
          error: e instanceof Error ? e.message : 'unknown',
          stateLength: state.length
        })
      }
    }
    
    // Fallback to query params for backward compatibility (non-OAuth flows or legacy)
    if (!redirectTo) {
      redirectTo = url.searchParams.get('redirectTo') || url.searchParams.get('next')
      
      // Decode the redirectTo if it was encoded (handle double-encoding from OAuth flow)
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
    }
    
    authDebug.logAuthFlow('oauth-callback', 'start', 'start', {
      hasCode: !!code,
      hasError: !!error,
      hasState: !!state,
      redirectTo
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
      
      // Determine final redirect destination
      // For OAuth flows: state parameter is the single source of truth (no sessionStorage fallback)
      // For non-OAuth flows: fallback to safe default
      if (!redirectTo) {
        // No redirect specified - use safe default (no /auth/signin bounce for OAuth)
        redirectTo = '/sales'
        authDebug.logAuthFlow('oauth-callback', 'no-redirect', 'success', {
          message: 'No redirectTo in state or query params, using default /sales'
        })
      }
      
      // Prevent redirect loops: never redirect to auth pages
      const finalRedirectTo = redirectTo.startsWith('/auth/') || redirectTo.startsWith('/login') || redirectTo.startsWith('/signin')
        ? '/sales'
        : redirectTo
      
      authDebug.logAuthFlow('oauth-callback', 'redirect', 'success', { redirectTo: finalRedirectTo })
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
