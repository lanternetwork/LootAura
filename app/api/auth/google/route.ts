import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Get the redirect URL for OAuth - use current request origin for dynamic URLs
    // Note: Using root redirect because Supabase is configured to redirect there
    const redirectUrl = `${request.nextUrl.origin}/`
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Google OAuth redirect URL:', redirectUrl)
    }

    // Initiate Google OAuth
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent', // Force consent screen to show
        },
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
      console.log('[AUTH] Google OAuth initiated:', { event: 'google-oauth', status: 'ok', url: data.url })
    }

    // Debug: Log the actual URL being returned
    console.log('[AUTH] DEBUG: OAuth URL returned by Supabase:', data.url)
    console.log('[AUTH] DEBUG: Expected Google OAuth URL should start with: https://accounts.google.com/oauth/authorize')

    // Return the OAuth URL instead of redirecting
    return NextResponse.json({ url: data.url })

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
