import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// NOTE: PostgREST only supports 'public' and 'graphql_public' schemas.
// We write to public views (sale_drafts, sales_v2, items_v2) which have INSTEAD OF triggers
// that route writes to the base tables in lootaura_v2 schema.

// RLS-aware client for API routes (uses public schema by default)
export function getRlsDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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

  // Use public schema (default) - PostgREST limitation
  return sb
}

// Service-role client (server-only, uses public schema by default)
export function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!

  if (!url || !key) {
    throw new Error('Supabase service role credentials missing')
  }

  const admin = createClient(url, key, { auth: { persistSession: false } })
  // Use public schema (default) - PostgREST limitation
  return admin
}

// Map base table names to public view names
// These views have INSTEAD OF triggers that route writes to lootaura_v2.* base tables
const TABLE_TO_VIEW: Record<string, string> = {
  'sale_drafts': 'sale_drafts',      // public.sale_drafts → lootaura_v2.sale_drafts
  'sales': 'sales_v2',                // public.sales_v2 → lootaura_v2.sales
  'items': 'items_v2',                // public.items_v2 → lootaura_v2.items
}

// Guard wrapper: map base table names to public views
export function fromBase(
  db: ReturnType<typeof getRlsDb> | ReturnType<typeof getAdminDb>,
  table: string
) {
  if (table.includes('.')) {
    throw new Error(`Use unqualified table name. Got: ${table}`)
  }
  
  // Map base table name to public view name
  const viewName = TABLE_TO_VIEW[table] || table
  return db.from(viewName)
}
