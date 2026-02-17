import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

// RLS-aware client for API routes
// Accepts optional request to ensure cookie context matches the request
// This ensures auth.uid() in RLS policies matches the authenticated user
export function getRlsDb(request?: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!url || !anon) {
    throw new Error('Supabase credentials missing')
  }

  // If request is provided, use its cookies for RLS context
  // Otherwise fall back to next/headers cookies() (for backward compatibility)
  const sb = createServerClient(url, anon, {
    cookies: request
      ? {
          // Use request cookies directly for RLS context
          // This ensures the RLS client sees the same session as supabase.auth.getUser()
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(_name: string, _value: string, _options: CookieOptions) {
            // Cookie setting is handled by response headers in API routes
            // This is read-only for RLS context evaluation
          },
          remove(_name: string, _options: CookieOptions) {
            // Cookie removal is handled by response headers
          },
        }
      : (() => {
          const cookieStore = cookies()
          return {
            get(name: string) {
              return cookieStore.get(name)?.value
            },
            set(name: string, value: string, options: CookieOptions) {
              cookieStore.set({ name, value, ...options })
            },
            remove(name: string, options: CookieOptions) {
              cookieStore.set({ name, value: '', ...options, maxAge: 0 })
            },
          }
        })(),
    // Explicitly set auth persistence to ensure session is available
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

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
  db: ReturnType<typeof getRlsDb> | ReturnType<typeof getAdminDb>,
  table: string
) {
  if (table.includes('.')) {
    throw new Error(`Use schema('lootaura_v2') + unqualified table name. Got: ${table}`)
  }
  return db.from(table)
}
