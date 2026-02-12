import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  
  // Generate correlation ID for request tracing
  const correlationId = Math.random().toString(36).substring(2, 15)
  
  // Resolve redirect destination in priority order:
  // 1) Explicit redirectTo/next query param (if preserved through OAuth)
  // 2) Default fallback (/sales)
  let redirectTo = url.searchParams.get('redirectTo') || url.searchParams.get('next')
  
  // Default fallback if no redirect intent found
  if (!redirectTo) {
    redirectTo = '/sales'
  }

  // Decode the redirectTo if it was encoded (handle double-encoding from OAuth flow)
  // OAuth providers may encode query params, so we need to decode once or twice
  try {
    // Try decoding once
    const decodedOnce = decodeURIComponent(redirectTo)
    // If it still looks encoded (contains %), try decoding again
    if (decodedOnce.includes('%')) {
      redirectTo = decodeURIComponent(decodedOnce)
    } else {
      redirectTo = decodedOnce
    }
  } catch (e) {
    // If decoding fails, use as-is
  }

  // Log only safe metadata - never log full URL, query params, codes, or redirectTo values
  console.log('[AUTH_CALLBACK] Processing OAuth callback:', {
    hasCode: !!code,
    hasError: !!error,
    pathname: url.pathname,
    requestId: correlationId
  })

  const cookieStore = cookies()

  // Detect if request is over HTTPS (for Vercel preview deployments)
  const protocol = url.protocol
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const isHttps = protocol === 'https:' ||
    forwardedProto === 'https' ||
    process.env.NODE_ENV === 'production'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Ensure cookies have proper options for cross-domain and security
              cookieStore.set({
                name,
                value,
                ...options,
                // Ensure these options are set for proper cookie handling
                path: options?.path || '/',
                sameSite: options?.sameSite || 'lax',
                secure: options?.secure !== undefined ? options.secure : isHttps,
                httpOnly: options?.httpOnly !== undefined ? options.httpOnly : true,
              })
            })
          } catch (error) {
            console.log('[AUTH_CALLBACK] Cookie setting failed:', error)
          }
        },
      },
      auth: {
        detectSessionInUrl: false, // We handle code exchange manually, don't auto-detect
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )

  // Handle OAuth errors
  if (error) {
    console.log('[AUTH_CALLBACK] OAuth error received', {
      hasError: true,
      pathname: url.pathname,
      requestId: correlationId
    })
    return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(error)}`, url.origin))
  }

  // Handle missing authorization code
  if (!code) {
    console.log('[AUTH_CALLBACK] Missing authorization code', {
      hasCode: false,
      pathname: url.pathname,
      requestId: correlationId
    })
    return NextResponse.redirect(new URL('/auth/error?error=missing_code', url.origin))
  }

  try {
    // Exchange authorization code for session
    console.log('[AUTH_CALLBACK] Exchanging code for session', {
      hasCode: true,
      pathname: url.pathname,
      requestId: correlationId
    })
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.log('[AUTH_CALLBACK] Code exchange failed', {
        hasError: true,
        pathname: url.pathname,
        requestId: correlationId
      })
      return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(exchangeError.message)}`, url.origin))
    }

    if (data.session) {
      console.log('[AUTH_CALLBACK] Code exchange successful', {
        hasSession: true,
        pathname: url.pathname,
        requestId: correlationId
      })

      // Ensure profile exists for the user (idempotent)
      try {
        const profileResponse = await fetch(new URL('/api/profile', url.origin), {
          method: 'POST',
          headers: {
            'Cookie': req.headers.get('cookie') || '',
          },
        })

        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          console.log('[AUTH_CALLBACK] Profile ensured', {
            created: profileData.created,
            pathname: url.pathname,
            requestId: correlationId
          })
        } else {
          console.log('[AUTH_CALLBACK] Profile creation failed, but continuing', {
            status: profileResponse.status,
            pathname: url.pathname,
            requestId: correlationId
          })
        }
      } catch (profileError) {
        console.log('[AUTH_CALLBACK] Profile creation error, but continuing', {
          hasError: true,
          pathname: url.pathname,
          requestId: correlationId
        })
        // Don't fail the auth flow if profile creation fails
      }

      // Success: user session cookies are automatically set by auth-helpers
      // Validate and sanitize redirect destination for security
      let finalRedirectTo = redirectTo
      
      // Security: Ensure redirectTo is a relative path (starts with /) to prevent open redirects
      if (!finalRedirectTo.startsWith('/')) {
        console.warn('[AUTH_CALLBACK] Invalid redirectTo path (not relative), defaulting to /sales', {
          pathname: url.pathname,
          requestId: correlationId
        })
        finalRedirectTo = '/sales'
      }
      
      // Security: Prevent redirect loops - never redirect to auth pages
      if (finalRedirectTo.startsWith('/auth/') || finalRedirectTo.startsWith('/login') || finalRedirectTo.startsWith('/signin')) {
        console.warn('[AUTH_CALLBACK] Preventing redirect loop - redirectTo is an auth page, using default', {
          pathname: url.pathname,
          requestId: correlationId
        })
        finalRedirectTo = '/sales'
      }
      
      // Security: Prevent redirects to external URLs (double-check)
      try {
        const testUrl = new URL(finalRedirectTo, 'http://localhost')
        if (testUrl.origin !== 'http://localhost') {
          console.warn('[AUTH_CALLBACK] External redirect detected, defaulting to /sales', {
            pathname: url.pathname,
            requestId: correlationId
          })
          finalRedirectTo = '/sales'
        }
      } catch (e) {
        // URL parsing failed, which is fine for relative paths
      }

      // Build redirect URL and ensure it doesn't contain the code parameter
      // This prevents the client-side from trying to exchange the code again
      // Parse the redirectTo to handle query parameters correctly
      const [path, queryString] = finalRedirectTo.split('?')
      const redirectUrl = new URL(path, url.origin)
      if (queryString) {
        const params = new URLSearchParams(queryString)
        params.forEach((value, key) => {
          redirectUrl.searchParams.set(key, value)
        })
      }
      redirectUrl.searchParams.delete('code')
      redirectUrl.searchParams.delete('error')

      console.log('[AUTH_CALLBACK] Redirecting', {
        hasRedirect: true,
        pathname: url.pathname,
        requestId: correlationId
      })
      return NextResponse.redirect(redirectUrl)
    } else {
      console.log('[AUTH_CALLBACK] Code exchange succeeded but no session received', {
        hasSession: false,
        pathname: url.pathname,
        requestId: correlationId
      })
      return NextResponse.redirect(new URL('/auth/error?error=no_session', url.origin))
    }
  } catch (error) {
    console.log('[AUTH_CALLBACK] Unexpected error during code exchange', {
      hasError: true,
      pathname: url.pathname,
      requestId: correlationId
    })
    return NextResponse.redirect(new URL('/auth/error?error=exchange_failed', url.origin))
  }
}