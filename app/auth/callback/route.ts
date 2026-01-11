import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  // Check for redirectTo (preferred) or next (fallback)
  // Store original value to check if it was missing (for sessionStorage fallback)
  const originalRedirectTo = url.searchParams.get('redirectTo') || url.searchParams.get('next')
  let redirectTo = originalRedirectTo
  
  // If no redirectTo in query, default to /sales for backward compatibility
  // The signin page will check sessionStorage when user is already authenticated
  if (!redirectTo) {
    redirectTo = '/sales'
  }
  
  // Decode the redirectTo if it was encoded
  try {
    redirectTo = decodeURIComponent(redirectTo)
  } catch (e) {
    // If decoding fails, use as-is
  }

  console.log('[AUTH_CALLBACK] Processing OAuth callback:', { 
    hasCode: !!code, 
    hasError: !!error, 
    redirectTo,
    url: url.href 
  })

  const cookieStore = cookies()
  
  // Detect if request is over HTTPS (for Vercel preview deployments)
  const protocol = url.protocol
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const isHttps = protocol === 'https:' || 
                 forwardedProto === 'https' ||
                 url.href.startsWith('https://') ||
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
    console.log('[AUTH_CALLBACK] OAuth error received:', error)
    return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(error)}`, url.origin))
  }

  // Handle missing authorization code
  if (!code) {
    console.log('[AUTH_CALLBACK] Missing authorization code')
    return NextResponse.redirect(new URL('/auth/error?error=missing_code', url.origin))
  }

  try {
    // Exchange authorization code for session
    console.log('[AUTH_CALLBACK] Exchanging code for session...')
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.log('[AUTH_CALLBACK] Code exchange failed:', exchangeError.message)
      return NextResponse.redirect(new URL(`/auth/error?error=${encodeURIComponent(exchangeError.message)}`, url.origin))
    }

    if (data.session) {
      console.log('[AUTH_CALLBACK] Code exchange successful, user authenticated:', data.session.user.id)
      
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
          console.log('[AUTH_CALLBACK] Profile ensured:', { 
            created: profileData.created,
            userId: data.session.user.id 
          })
        } else {
          console.log('[AUTH_CALLBACK] Profile creation failed, but continuing:', profileResponse.status)
        }
      } catch (profileError) {
        console.log('[AUTH_CALLBACK] Profile creation error, but continuing:', profileError)
        // Don't fail the auth flow if profile creation fails
      }
      
      // Success: user session cookies are automatically set by auth-helpers
      // If redirectTo was missing from query (defaulted to /sales), redirect to signin page
      // which can check sessionStorage for auth:postLoginRedirect
      let finalRedirectTo = redirectTo
      if (!originalRedirectTo && finalRedirectTo === '/sales') {
        // No redirectTo was provided - redirect to signin to check sessionStorage
        console.log('[AUTH_CALLBACK] No redirectTo provided, redirecting to signin to check sessionStorage')
        const signinUrl = new URL('/auth/signin', url.origin)
        return NextResponse.redirect(signinUrl)
      }
      
      // Prevent redirect loops: never redirect to auth pages
      if (finalRedirectTo.startsWith('/auth/') || finalRedirectTo.startsWith('/login') || finalRedirectTo.startsWith('/signin')) {
        console.warn('[AUTH_CALLBACK] Preventing redirect loop - redirectTo is an auth page, using default:', redirectTo)
        finalRedirectTo = '/sales'
      }
      
      // Ensure redirectTo is a valid path (starts with /)
      if (!finalRedirectTo.startsWith('/')) {
        console.warn('[AUTH_CALLBACK] Invalid redirectTo path, defaulting to /sales:', finalRedirectTo)
        finalRedirectTo = '/sales'
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
      
      console.log('[AUTH_CALLBACK] Redirecting to:', redirectUrl.toString())
      return NextResponse.redirect(redirectUrl)
    } else {
      console.log('[AUTH_CALLBACK] Code exchange succeeded but no session received')
      return NextResponse.redirect(new URL('/auth/error?error=no_session', url.origin))
    }
  } catch (error) {
    console.log('[AUTH_CALLBACK] Unexpected error during code exchange:', error)
    return NextResponse.redirect(new URL('/auth/error?error=exchange_failed', url.origin))
  }
}