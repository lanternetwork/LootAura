import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Server-only session management utilities
 * Handles HttpOnly, Secure, SameSite=Strict cookies for authentication
 */

export interface SessionTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

export interface SupabaseSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user: {
    id: string
    email?: string
  }
}

/**
 * Create a Supabase server client bound to request cookies
 * Uses service role key for server-side operations
 */
export function createServerSupabaseClient(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            // Cookie setting can fail in middleware, that's ok
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[AUTH] Cookie setting failed in middleware:', error)
            }
          }
        },
      },
    }
  )
}

/**
 * Set HttpOnly, Secure, SameSite=Strict session cookies
 * Aligns expiry with Supabase session lifetime
 */
export function setSessionCookies(
  response: NextResponse,
  session: SupabaseSession | SessionTokens
): void {
  const expiresAt = new Date(session.expires_at * 1000)
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

  // Set access token cookie
  response.cookies.set('sb-access-token', session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.min(maxAge, 3600), // Cap at 1 hour for security
    expires: expiresAt,
  })

  // Set refresh token cookie
  response.cookies.set('sb-refresh-token', session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.min(maxAge, 7 * 24 * 3600), // Cap at 7 days
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  })

  // Set session expiry cookie for client-side checks
  response.cookies.set('sb-session-expires', session.expires_at.toString(), {
    httpOnly: false, // Client can read this for UI state
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.min(maxAge, 3600),
    expires: expiresAt,
  })

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[AUTH] Session cookies set', {
      event: 'set-session-cookies',
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
      maxAge: Math.min(maxAge, 3600)
    })
  }
}

/**
 * Clear all session cookies on logout or session invalidation
 */
export function clearSessionCookies(response: NextResponse): void {
  const cookiesToClear = [
    'sb-access-token',
    'sb-refresh-token', 
    'sb-session-expires'
  ]

  cookiesToClear.forEach(cookieName => {
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
      expires: new Date(0), // Expire immediately
    })
  })

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[AUTH] Session cookies cleared', {
      event: 'clear-session-cookies'
    })
  }
}

/**
 * Validate session from cookies
 * Returns session data if valid, null if invalid/expired
 */
export async function validateSession(cookieStore: ReturnType<typeof cookies>) {
  try {
    const supabase = createServerSupabaseClient(cookieStore)
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Session validation failed:', error?.message || 'No session')
      }
      return null
    }

    // Check if session is expired
    if (session.expires_at && session.expires_at < Date.now() / 1000) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AUTH] Session expired')
      }
      return null
    }

    return session
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Session validation error:', error)
    }
    return null
  }
}

/**
 * Check if user is authenticated based on session cookies
 * Lightweight check for middleware
 */
export function hasValidSession(cookieStore: ReturnType<typeof cookies>): boolean {
  try {
    const accessToken = cookieStore.get('sb-access-token')
    const refreshToken = cookieStore.get('sb-refresh-token')
    const expiresAt = cookieStore.get('sb-session-expires')
    
    if (!accessToken || !refreshToken || !expiresAt) {
      return false
    }

    // Check if session is expired
    const expiresTimestamp = parseInt(expiresAt.value)
    if (isNaN(expiresTimestamp) || expiresTimestamp < Date.now() / 1000) {
      return false
    }

    return true
  } catch (error) {
    return false
  }
}
