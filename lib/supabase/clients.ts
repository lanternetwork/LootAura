/**
 * Schema-scoped Supabase client helpers
 * 
 * These helpers return clients configured for the lootaura_v2 schema,
 * allowing unqualified table names (e.g., .from('sales') instead of .from('lootaura_v2.sales'))
 * 
 * Writes → base tables only (lootaura_v2.sales/items/sale_drafts)
 * Reads from views → use createSupabaseServerClient() which uses 'public' schema
 */

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { ENV_PUBLIC, ENV_SERVER } from '../env'

/**
 * Get RLS-aware server client scoped to lootaura_v2 schema
 * Uses user session for Row Level Security (for route handlers)
 * 
 * Use for writes that respect RLS policies (e.g., user's own drafts)
 */
export function getUserServerDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('Supabase credentials missing')
  }

  const cookieStore = cookies()

  const client = createServerClient(url, anon, {
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
    db: { schema: 'lootaura_v2' }, // Schema-scoped for base table access
  })

  return client
}

/**
 * Get admin client scoped to lootaura_v2 schema
 * Uses service role key to bypass RLS (for trusted server operations)
 * 
 * NEVER import this in client-side code
 * 
 * Use for writes that need to bypass RLS (e.g., creating sales/items during publish)
 */
export function getAdminDb() {
  // Check process.env first to avoid triggering ENV_SERVER validation during build
  const serviceRoleFromEnv = process.env.SUPABASE_SERVICE_ROLE

  let serviceRoleKey: string

  if (serviceRoleFromEnv) {
    serviceRoleKey = serviceRoleFromEnv
  } else {
    // During build time or if not in process.env, try ENV_SERVER
    try {
      serviceRoleKey = ENV_SERVER.SUPABASE_SERVICE_ROLE
    } catch {
      // During build, use placeholder for type checking
      serviceRoleKey = 'placeholder-key-for-build-type-checking-only'
    }
  }

  const admin = createClient(
    ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      db: { schema: 'lootaura_v2' }, // Schema-scoped for base table access
    }
  )

  return admin
}

