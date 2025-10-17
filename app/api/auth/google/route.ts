import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Get the redirect URL for OAuth
    const redirectUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      : `${request.nextUrl.origin}/auth/callback`

    // Initiate Google OAuth
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    })

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Google OAuth failed:', { event: 'google-oauth', status: 'fail', code: error.message })
      }
      
      return NextResponse.json(
        { code: error.message, message: 'Auth failed' },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Google OAuth initiated:', { event: 'google-oauth', status: 'ok' })
    }

    // Redirect to Google OAuth URL
    return NextResponse.redirect(data.url)

  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Google OAuth error:', { event: 'google-oauth', status: 'fail' })
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
