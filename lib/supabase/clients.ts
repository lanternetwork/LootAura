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
  // getUser() is more reliable than getSession() for SSR - it validates the JWT and loads the session
  // This makes the session available for the client to include the JWT in subsequent database requests
  // Don't throw if session is missing - let the caller handle auth errors
  try {
    // Use getUser() instead of getSession() - it's more reliable for SSR and ensures JWT is validated
    // getUser() will load the session from cookies and validate it, making it available for RLS
    const { data: { user }, error } = await sb.auth.getUser()
    
    // Debug logging to diagnose session loading issues
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      if (error) {
        const { logger } = await import('@/lib/log')
        logger.debug('getRlsDb: getUser() error', {
          component: 'supabase',
          operation: 'getRlsDb',
          error: error.message,
          errorCode: error.status,
        })
      } else if (!user) {
        const { logger } = await import('@/lib/log')
        logger.debug('getRlsDb: getUser() returned null user', {
          component: 'supabase',
          operation: 'getRlsDb',
          hasUser: false,
        })
      }
    }
  } catch (error) {
    // Session might not exist - that's ok, caller will handle auth errors
    // RLS policies will evaluate auth.uid() as null, which is expected for unauthenticated requests
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('getRlsDb: getUser() exception', {
        component: 'supabase',
        operation: 'getRlsDb',
        error: error instanceof Error ? error.message : String(error),
      })
    }
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
