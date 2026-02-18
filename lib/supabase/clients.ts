import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

// RLS-aware client for API routes
// In API routes, always use cookies() from next/headers for consistent cookie reading
// This ensures auth.uid() in RLS policies matches the authenticated user
// The request parameter is kept for backward compatibility but not used for cookie reads/writes
export async function getRlsDb(_request?: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!url || !anon) {
    throw new Error('Supabase credentials missing')
  }

  // In API routes, always use cookies() from next/headers for consistency
  // This ensures the RLS client sees the same session as createSupabaseServerClient()
  // The request parameter is kept for backward compatibility but not used for cookie reading
  const cookieStore = cookies()
  
  const sb = createServerClient(url, anon, {
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
    // Explicitly set auth persistence to ensure session is available
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  // Load session from cookies to ensure JWT is available for RLS policies
  // RLS policies need auth.uid() which comes from the JWT token in request headers
  // We call both getUser() (validates JWT) and getSession() (loads session with access_token)
  // This ensures the session is fully loaded into the client for RLS to work
  // Don't throw if session is missing - let the caller handle auth errors
  try {
    // First validate the user (getUser() is more reliable for SSR)
    const { data: { user }, error: userError } = await sb.auth.getUser()
    
    // If user is valid, load the full session (needed for RLS access_token)
    if (user && !userError) {
      const { data: { session }, error: sessionError } = await sb.auth.getSession()
      
      // Explicitly set the session on the client to ensure JWT is in request headers for RLS
      // This is critical: RLS policies need the JWT token in the Authorization header
      // getSession() loads from cookies but doesn't automatically attach to client for RLS
      if (session && !sessionError) {
        const setSessionResult = await sb.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
        
        // Log setSession result for diagnosis
        if (process.env.NEXT_PUBLIC_DEBUG === 'true' || setSessionResult.error) {
          const { logger } = await import('@/lib/log')
          if (setSessionResult.error) {
            logger.warn('getRlsDb: setSession() failed', {
              component: 'supabase',
              operation: 'getRlsDb',
              error: setSessionResult.error.message,
              hasUser: true,
              userId: user.id.substring(0, 8) + '...',
            })
          } else {
            logger.debug('getRlsDb: setSession() succeeded', {
              component: 'supabase',
              operation: 'getRlsDb',
              hasUser: true,
              hasSession: true,
              userId: user.id.substring(0, 8) + '...',
            })
          }
        }
      }
      
      // Log session loading issues (warn level for production visibility)
      // This helps diagnose RLS failures even without debug mode
      if (sessionError || !session) {
        const { logger } = await import('@/lib/log')
        logger.warn('getRlsDb: session loading issue (may cause RLS failures)', {
          component: 'supabase',
          operation: 'getRlsDb',
          hasUser: true,
          hasSession: !!session,
          hasSessionError: !!sessionError,
          sessionError: sessionError?.message,
          userId: user.id.substring(0, 8) + '...',
        })
      }
      
      // Debug logging with more detail
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        if (sessionError) {
          logger.debug('getRlsDb: getSession() error after getUser() success', {
            component: 'supabase',
            operation: 'getRlsDb',
            error: sessionError.message,
            hasUser: true,
            userId: user.id.substring(0, 8) + '...',
          })
        } else if (!session) {
          logger.debug('getRlsDb: getSession() returned null session after getUser() success', {
            component: 'supabase',
            operation: 'getRlsDb',
            hasUser: true,
            hasSession: false,
            userId: user.id.substring(0, 8) + '...',
          })
        } else {
          logger.debug('getRlsDb: session loaded successfully', {
            component: 'supabase',
            operation: 'getRlsDb',
            hasUser: true,
            hasSession: true,
            hasAccessToken: !!session.access_token,
            userId: user.id.substring(0, 8) + '...',
          })
        }
      }
    } else {
      // Log getUser() failures (warn level for production visibility)
      if (userError) {
        const { logger } = await import('@/lib/log')
        logger.warn('getRlsDb: getUser() failed (RLS will fail)', {
          component: 'supabase',
          operation: 'getRlsDb',
          error: userError.message,
          errorCode: userError.status,
        })
      }
      
      // Debug logging with more detail
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        if (!user) {
          logger.debug('getRlsDb: getUser() returned null user', {
            component: 'supabase',
            operation: 'getRlsDb',
            hasUser: false,
          })
        }
      }
    }
  } catch (error) {
    // Session might not exist - that's ok, caller will handle auth errors
    // RLS policies will evaluate auth.uid() as null, which is expected for unauthenticated requests
    const { logger } = await import('@/lib/log')
    logger.warn('getRlsDb: session loading exception', {
      component: 'supabase',
      operation: 'getRlsDb',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return sb.schema('lootaura_v2')
}

// Service-role client (server-only)
export function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!

  if (!url || !key) {
    throw new Error('Supabase service role credentials missing')
  }

  const admin = createClient(url, key, { auth: { persistSession: false } })
  return admin.schema('lootaura_v2')
}

// Guard wrapper: block qualified names
export function fromBase(
  db: Awaited<ReturnType<typeof getRlsDb>> | ReturnType<typeof getAdminDb>,
  table: string
) {
  if (table.includes('.')) {
    throw new Error(`Use schema('lootaura_v2') + unqualified table name. Got: ${table}`)
  }
  return db.from(table)
}
