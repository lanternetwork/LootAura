/**
 * Schema-scoped Supabase client helpers
 * 
 * NOTE: Writes → lootaura_v2.* only via schema-scoped clients. Reads from public views allowed.
 * Do not write to views.
 */

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { ENV_PUBLIC, ENV_SERVER } from '../env'

/**
 * RLS-aware client for route handlers (user session). Writes/reads to lootaura_v2.
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
  })

  return sb.schema('lootaura_v2')
}

/**
 * Service-role client (trusted server ops only; NEVER import in client components).
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
  })

  return admin.schema('lootaura_v2')
}

/**
 * Guard wrapper: prevent qualified names in .from()
 */
export function fromBase<T extends ReturnType<typeof getRlsDb> | ReturnType<typeof getAdminDb>>(
  db: T,
  table: string
) {
  if (table.includes('.')) {
    throw new Error(`Do not qualify table names. Use schema('lootaura_v2').from('<unqualified>')`)
  }
  return db.from(table)
}
