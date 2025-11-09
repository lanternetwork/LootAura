/**
 * Schema-scoped Supabase client helpers
 * 
 * NOTE: Writes → lootaura_v2.* only via schema-scoped clients. Reads from public views allowed.
 * 
 * All writes go to base tables using schema-scoped Supabase clients.
 * No .from('lootaura_v2.*') anywhere. Keep reads from views intact.
 */

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { ENV_PUBLIC, ENV_SERVER } from '../env'

/**
 * RLS-aware client for route handlers (user session).
 * Returns a client scoped to lootaura_v2 schema.
 * 
 * IMPORTANT: Use unqualified table names: fromBase(db, 'sales') not .from('lootaura_v2.sales')
 */
export function getRlsDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('Supabase credentials missing')
  }

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
    db: { schema: 'lootaura_v2' }, // Schema-scoped for base table access
  })

  // IMPORTANT: schema is set in config above, use unqualified table names in .from()
  return sb
}

/**
 * Service-role client for trusted server ops (never import in client components).
 * Returns a client scoped to lootaura_v2 schema.
 * 
 * IMPORTANT: Use unqualified table names: fromBase(db, 'sales') not .from('lootaura_v2.sales')
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

  const url = ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema: 'lootaura_v2' }, // Schema-scoped for base table access
  })

  // IMPORTANT: schema is set in config above, use unqualified table names in .from()
  return admin
}

/**
 * Guard helper: prevent qualified table names from slipping in.
 * 
 * @param db - Schema-scoped client from getRlsDb() or getAdminDb()
 * @param table - Unqualified table name (e.g., 'sales', not 'lootaura_v2.sales')
 * @returns The query builder for the specified table
 */
export function fromBase(
  db: ReturnType<typeof getRlsDb> | ReturnType<typeof getAdminDb>,
  table: string
) {
  if (table.includes('.')) {
    throw new Error(
      `Do not qualify table names: received "${table}". Use schema('lootaura_v2').from('<unqualified>')`
    )
  }
  return db.from(table)
}

