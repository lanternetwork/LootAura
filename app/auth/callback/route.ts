import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  // Check for redirectTo (preferred) or next (fallback)
  let redirectTo = url.searchParams.get('redirectTo') || url.searchParams.get('next')
  
  // If no redirectTo in query, default to /sales
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
              cookieStore.set({ name, value, ...options })
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
      
      // Check if user needs onboarding (home_zip is NULL)
      let finalRedirectTo = redirectTo
      
      // Prevent redirect loops: never redirect to auth pages
      if (finalRedirectTo.startsWith('/auth/') || finalRedirectTo.startsWith('/login') || finalRedirectTo.startsWith('/signin')) {
        console.warn('[AUTH_CALLBACK] Preventing redirect loop - redirectTo is an auth page, using default:', redirectTo)
        finalRedirectTo = '/sales'
      }
      
      // Check onboarding requirement
      try {
        const profileResponse = await fetch(new URL('/api/profile', url.origin), {
          method: 'GET',
          headers: {
            'Cookie': req.headers.get('cookie') || '',
          },
        })
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          const homeZip = profileData.data?.home_zip
          
          // If user doesn't have home_zip, redirect to onboarding
          if (!homeZip) {
            const onboardingUrl = new URL('/onboarding/location', url.origin)
            // Preserve original redirectTo if it's not an auth/onboarding page
            if (!finalRedirectTo.startsWith('/onboarding/') && !finalRedirectTo.startsWith('/auth/')) {
              onboardingUrl.searchParams.set('redirectTo', finalRedirectTo)
            }
            console.log('[AUTH_CALLBACK] User needs onboarding, redirecting to:', onboardingUrl.toString())
            return NextResponse.redirect(onboardingUrl)
          }
        }
      } catch (onboardingCheckError) {
        // If onboarding check fails, continue with normal redirect
        // Don't block auth flow if profile check fails
        console.log('[AUTH_CALLBACK] Onboarding check failed, continuing with normal redirect:', onboardingCheckError)
      }
      
      // Build redirect URL and ensure it doesn't contain the code parameter
      // This prevents the client-side from trying to exchange the code again
      const redirectUrl = new URL(finalRedirectTo, url.origin)
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