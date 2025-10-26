import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, setSessionCookies, isValidSession } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Always log callback attempts for debugging
    console.log('[AUTH] OAuth callback hit:', { url: request.url, method: request.method })
    
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Get the authorization code from URL parameters
    const code = request.nextUrl.searchParams.get('code')
    const oauthError = request.nextUrl.searchParams.get('error')

    console.log('[AUTH] OAuth callback received:', { code: !!code, error: oauthError, url: request.url })

    // Handle OAuth error
    if (oauthError) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] OAuth callback error:', { event: 'oauth-callback', status: 'fail', error: oauthError })
      }
      
      const signinUrl = new URL('/auth/signin', request.url)
      signinUrl.searchParams.set('error', 'oauth_failed')
      return NextResponse.redirect(signinUrl)
    }

    // Exchange code for session
    if (code) {
      console.log('[AUTH] Attempting code exchange for session...')
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      console.log('[AUTH] Code exchange result:', { 
        hasData: !!data, 
        hasError: !!exchangeError, 
        hasSession: !!(data?.session),
        errorMessage: exchangeError?.message 
      })
      
      if (exchangeError) {
        console.log('[AUTH] Code exchange failed:', { event: 'oauth-callback', status: 'fail', error: exchangeError.message })
        
        const signinUrl = new URL('/auth/signin', request.url)
        signinUrl.searchParams.set('error', 'oauth_failed')
        return NextResponse.redirect(signinUrl)
      }

      if (data.session && isValidSession(data.session)) {
        console.log('[AUTH] Code exchange successful, setting session cookies...')
        // Set session cookies
        const response = NextResponse.redirect(new URL('/', request.url))
        setSessionCookies(response, data.session)

        console.log('[AUTH] OAuth callback successful:', { event: 'oauth-callback', status: 'ok', userId: data.session.user.id })

        return response
      } else {
        console.log('[AUTH] Code exchange succeeded but no valid session:', { hasSession: !!data.session, isValid: data.session ? isValidSession(data.session) : false })
      }
    }

    // Fallback: try to get existing session
    const { data, error } = await supabase.auth.getSession()

    if (error || !data.session || !isValidSession(data.session)) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] OAuth callback failed - no valid session:', { event: 'oauth-callback', status: 'fail' })
      }
      
      const signinUrl = new URL('/auth/signin', request.url)
      signinUrl.searchParams.set('error', 'oauth_failed')
      return NextResponse.redirect(signinUrl)
    }

    // Set session cookies
    const response = NextResponse.redirect(new URL('/', request.url))
    setSessionCookies(response, data.session)

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] OAuth callback successful (existing session):', { event: 'oauth-callback', status: 'ok' })
    }

    return response

  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] OAuth callback error:', { event: 'oauth-callback', status: 'fail', error: error instanceof Error ? error.message : 'Unknown error' })
    }

    const signinUrl = new URL('/auth/signin', request.url)
    signinUrl.searchParams.set('error', 'oauth_error')
    return NextResponse.redirect(signinUrl)
  }
}