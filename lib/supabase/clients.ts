/**
 * Schema-scoped Supabase client helpers
 * 
 * NOTE: Writes → lootaura_v2.* only via schema-scoped clients. Reads from public views allowed.
 * 
 * IMPORTANT: We don't set a schema in the client config to allow fully-qualified table names
 * like lootaura_v2.sale_drafts to work. The fromBase() helper constructs these names.
 */

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { ENV_PUBLIC, ENV_SERVER } from '../env'

/**
 * RLS-aware client for route handlers (user session).
 * No schema set in config to allow fully-qualified names like lootaura_v2.sale_drafts.
 * 
 * IMPORTANT: Use fromBase() helper to access lootaura_v2 tables with unqualified names.
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
    // Don't set schema - allows fully-qualified names like lootaura_v2.sale_drafts to work
  })

  return sb
}

/**
 * Service-role client for trusted server ops (never import in client components).
 * No schema set in config to allow fully-qualified names like lootaura_v2.sale_drafts.
 * 
 * IMPORTANT: Use fromBase() helper to access lootaura_v2 tables with unqualified names.
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
    // Don't set schema - allows fully-qualified names like lootaura_v2.sale_drafts to work
  })

  return admin
}

/**
 * Helper to access lootaura_v2 base tables using fully-qualified names.
 * 
 * @param db - Client from getRlsDb() or getAdminDb() (no schema set in config)
 * @param table - Unqualified table name (e.g., 'sales', not 'lootaura_v2.sales')
 * @returns The query builder for the specified table in lootaura_v2 schema
 */
export function fromBase(
  db: ReturnType<typeof getRlsDb> | ReturnType<typeof getAdminDb>,
  table: string
) {
  if (table.includes('.')) {
    throw new Error(
      `Do not qualify table names: received "${table}". Use fromBase(db, '<unqualified>') which will qualify it as lootaura_v2.<table>`
    )
  }
  // Use fully-qualified names to access lootaura_v2 tables (works when no schema is set in client config)
  return db.from(`lootaura_v2.${table}`)
}

