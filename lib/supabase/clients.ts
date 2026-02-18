import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { logger } from '@/lib/log'

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
  
  // Use getAll/setAll pattern (recommended for Next.js App Router)
  // This ensures all cookies are read/written correctly, especially for OAuth flows
  const sb = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options })
          })
        } catch (error) {
          // Cookie setting can fail in some contexts, that's ok
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            logger.debug('getRlsDb: cookie setting failed', {
              component: 'supabase',
              operation: 'getRlsDb',
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
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
  // The SSR client reads from cookies automatically, but we need to trigger the initial load
  // getSession() reads from cookies and makes the session available for RLS to evaluate auth.uid()
  // CRITICAL: We must explicitly set the session on the client BEFORE calling .schema()
  // This ensures the schema-scoped client inherits the Authorization header with the JWT
  // Without this, RLS policies will evaluate auth.uid() as null even though the session exists
  try {
    const { data: { session } } = await sb.auth.getSession()
    if (session) {
      // Explicitly set the session on the client to ensure JWT is in Authorization header
      // This is critical for schema-scoped clients to have access to the JWT for RLS evaluation
      await sb.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    }
  } catch {
    // Session might not exist - that's ok, caller will handle auth errors
    // RLS policies will evaluate auth.uid() as null, which is expected for unauthenticated requests
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
