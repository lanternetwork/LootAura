import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, setSessionCookies, isValidSession } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Get return destination from URL parameters
    const returnTo = request.nextUrl.searchParams.get('returnTo') || '/sales'

    // Handle OAuth callback
    const { data, error } = await supabase.auth.getSession()

    if (error || !data.session || !isValidSession(data.session)) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] OAuth callback failed:', { event: 'oauth-callback', status: 'fail' })
      }
      
      // Redirect to signin with error and preserve return destination
      const signinUrl = new URL('/auth/signin', request.url)
      signinUrl.searchParams.set('error', 'oauth_failed')
      signinUrl.searchParams.set('redirectTo', returnTo)
      return NextResponse.redirect(signinUrl)
    }

    // Set session cookies
    const response = NextResponse.redirect(new URL(returnTo, request.url))
    setSessionCookies(response, data.session)

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] OAuth callback successful:', { event: 'oauth-callback', status: 'ok', returnTo })
    }

    return response

  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] OAuth callback error:', { event: 'oauth-callback', status: 'fail' })
    }

    // Redirect to signin with error
    const signinUrl = new URL('/auth/signin', request.url)
    signinUrl.searchParams.set('error', 'oauth_error')
    return NextResponse.redirect(signinUrl)
  }
}