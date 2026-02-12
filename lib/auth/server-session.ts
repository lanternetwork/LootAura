import { createServerClient, type CookieOptions } from '@supabase/ssr'
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

// Type guard to check if session has required properties
export function isValidSession(session: any): session is SupabaseSession {
  return (
    session &&
    typeof session.access_token === 'string' &&
    typeof session.refresh_token === 'string' &&
    typeof session.expires_at === 'number' &&
    session.user &&
    typeof session.user.id === 'string'
  )
}

/**
 * Create a Supabase server client bound to request cookies
 * Uses anon key with RLS-aware authentication (respects RLS policies)
 * 
 * SECURITY: This function now uses anon key instead of service role to ensure
 * RLS policies are enforced. Use getAdminDb() from lib/supabase/clients.ts
 * only for admin-only operations where RLS bypass is explicitly required.
 */
export function createServerSupabaseClient(cookieStore: ReturnType<typeof cookies>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  if (!url || !anon) {
    throw new Error('Supabase credentials missing')
  }
  
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: CookieOptions }) => {
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
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
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
    // Use the same Supabase client creation method as the route handlers
    // This ensures we read cookies the same way (handles Google OAuth correctly)
    const { createServerClient } = await import('@supabase/ssr')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !anon) {
      return null
    }
    
    const supabase = createServerClient(url, anon, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options?: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Cookie setting can fail in middleware, that's ok
          }
        },
        remove(name: string, options?: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options, maxAge: 0 })
          } catch (error) {
            // Cookie removal can fail in middleware, that's ok
          }
        },
      },
    })
    
    // Try getUser() first (more reliable for SSR sessions)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (user && !userError) {
      // User found, try to get full session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (session && !sessionError) {
        // Check if session is expired
        if (session.expires_at && session.expires_at < Date.now() / 1000) {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[AUTH] Session expired')
          }
          return null
        }
        return session
      }
      
      // If getUser() succeeded but getSession() failed, user is still authenticated
      // Return a minimal session object
      return {
        access_token: '',
        refresh_token: '',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        user: {
          id: user.id,
          email: user.email
        }
      } as any
    }
    
    if (userError && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AUTH] Session validation failed:', userError?.message || 'No session')
    }
    return null
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
