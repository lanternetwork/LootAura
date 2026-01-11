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
    
    // TEMPORARY DIAGNOSTIC LOGGING - Remove after debugging
    console.log('[OAUTH_CALLBACK_DEBUG] === OAuth Callback Request ===')
    console.log('[OAUTH_CALLBACK_DEBUG] Full URL:', url.toString())
    console.log('[OAUTH_CALLBACK_DEBUG] All query params:', Object.fromEntries(url.searchParams.entries()))
    console.log('[OAUTH_CALLBACK_DEBUG] Raw state value:', state === null ? 'null' : state === '' ? 'empty string' : `"${state}" (length: ${state.length})`)
    console.log('[OAUTH_CALLBACK_DEBUG] State type:', typeof state)
    console.log('[OAUTH_CALLBACK_DEBUG] State present:', !!state)
    
    // Decode redirectTo from OAuth state parameter (primary source of truth for OAuth redirects)
    // State is base64-encoded JSON: { redirectTo: '/sell/new?resume=promotion' }
    let redirectTo: string | null = null
    
    if (state) {
      console.log('[OAUTH_CALLBACK_DEBUG] Attempting to decode state...')
      try {
        // Supabase may URL-encode the state parameter, so decode it first
        let decodedState = state
        try {
          decodedState = decodeURIComponent(state)
          console.log('[OAUTH_CALLBACK_DEBUG] URL decoding successful, decoded length:', decodedState.length)
        } catch (urlDecodeError) {
          // If URL decoding fails, use state as-is (might already be decoded)
          decodedState = state
          console.log('[OAUTH_CALLBACK_DEBUG] URL decoding skipped (already decoded or invalid):', urlDecodeError instanceof Error ? urlDecodeError.message : 'unknown')
        }
        
        // Decode base64 state to get JSON payload
        // Buffer is safe here because this route explicitly runs in Node.js runtime (see export const runtime above)
        console.log('[OAUTH_CALLBACK_DEBUG] Attempting base64 decode...')
        const base64Decoded = Buffer.from(decodedState, 'base64').toString('utf-8')
        console.log('[OAUTH_CALLBACK_DEBUG] Base64 decoded string:', base64Decoded)
        
        const statePayload = JSON.parse(base64Decoded)
        console.log('[OAUTH_CALLBACK_DEBUG] JSON parse successful, payload:', statePayload)
        
        if (statePayload && typeof statePayload.redirectTo === 'string') {
          redirectTo = statePayload.redirectTo
          console.log('[OAUTH_CALLBACK_DEBUG] State decoding SUCCESS - redirectTo extracted:', redirectTo)
          authDebug.logAuthFlow('oauth-callback', 'state-decoded', 'success', { redirectTo })
        } else {
          console.log('[OAUTH_CALLBACK_DEBUG] State payload missing redirectTo or wrong type:', { 
            hasPayload: !!statePayload, 
            redirectToType: typeof statePayload?.redirectTo,
            redirectToValue: statePayload?.redirectTo 
          })
        }
      } catch (e) {
        // If state decoding fails, log but continue (fallback to query params or default)
        console.log('[OAUTH_CALLBACK_DEBUG] State decoding FAILED:', {
          error: e instanceof Error ? e.message : 'unknown',
          errorType: e instanceof Error ? e.constructor.name : typeof e,
          stateLength: state.length,
          statePreview: state.substring(0, 50) + (state.length > 50 ? '...' : '')
        })
        authDebug.logAuthFlow('oauth-callback', 'state-decode-error', 'error', { 
          error: e instanceof Error ? e.message : 'unknown',
          stateLength: state.length
        })
      }
    } else {
      console.log('[OAUTH_CALLBACK_DEBUG] State is missing or null - will fallback to query params')
    }
    
    // Fallback to query params for backward compatibility (non-OAuth flows or legacy)
    if (!redirectTo) {
      console.log('[OAUTH_CALLBACK_DEBUG] Falling back to query params...')
      redirectTo = url.searchParams.get('redirectTo') || url.searchParams.get('next')
      console.log('[OAUTH_CALLBACK_DEBUG] Query param redirectTo:', redirectTo)
      console.log('[OAUTH_CALLBACK_DEBUG] Query param next:', url.searchParams.get('next'))
      
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
          console.log('[OAUTH_CALLBACK_DEBUG] Query param decoded:', redirectTo)
        } catch (e) {
          // If decoding fails, use as-is
          console.log('[OAUTH_CALLBACK_DEBUG] Query param decoding failed, using as-is')
        }
      }
    }
    
    console.log('[OAUTH_CALLBACK_DEBUG] Final redirectTo BEFORE fallback logic:', redirectTo)
    console.log('[OAUTH_CALLBACK_DEBUG] === End Diagnostic Logging ===')
    
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
