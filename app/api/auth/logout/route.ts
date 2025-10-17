import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, clearSessionCookies } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Revoke the current session
    const { error } = await supabase.auth.signOut()

    if (error && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Sign-out error:', error.message)
    }

    // Create response and clear session cookies
    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    )

    clearSessionCookies(response)

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Logout successful:', { event: 'logout', status: 'ok' })
    }

    return response

  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Logout error:', error)
    }

    // Even if there's an error, clear the cookies
    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    )

    clearSessionCookies(response)
    return response
  }
}
