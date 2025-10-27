import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const next = url.searchParams.get('next') || '/sales' // Default redirect to sales page

  console.log('[AUTH_CALLBACK] Processing OAuth callback:', { 
    hasCode: !!code, 
    hasError: !!error, 
    next,
    url: url.href 
  })

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options, maxAge: 0 })
        },
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
      // Success: user session cookies are automatically set by auth-helpers
      return NextResponse.redirect(new URL(next, url.origin))
    } else {
      console.log('[AUTH_CALLBACK] Code exchange succeeded but no session received')
      return NextResponse.redirect(new URL('/auth/error?error=no_session', url.origin))
    }
  } catch (error) {
    console.log('[AUTH_CALLBACK] Unexpected error during code exchange:', error)
    return NextResponse.redirect(new URL('/auth/error?error=exchange_failed', url.origin))
  }
}
