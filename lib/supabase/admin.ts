/**
 * ⚠️  WARNING: ADMIN CLIENT - SERVER ONLY ⚠️
 * 
 * This file contains the admin Supabase client that uses the SERVICE_ROLE key.
 * NEVER import this file in client-side code (components, hooks, etc.).
 * 
 * This client bypasses Row Level Security (RLS) and should only be used for:
 * - Database migrations
 * - Admin operations
 * - Server-side data operations that require elevated privileges
 * 
 * Usage: Only in API routes, server actions, or build-time scripts
 */

import { createClient } from '@supabase/supabase-js'
import { ENV_PUBLIC, ENV_SERVER } from '../env'

// Lazy initialization to avoid validation errors during build time
let _adminSupabase: ReturnType<typeof createClient> | null = null

function getAdminSupabase() {
  if (!_adminSupabase) {
    if (!ENV_SERVER.SUPABASE_SERVICE_ROLE) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE for admin client')
    }
    
    _adminSupabase = createClient(
      ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL,
      ENV_SERVER.SUPABASE_SERVICE_ROLE,
      { 
        auth: { 
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    )
  }
  return _adminSupabase
}

export const adminSupabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    const client = getAdminSupabase()
    const value = client[prop as keyof typeof client]
    return typeof value === 'function' ? value.bind(client) : value
  }
})

// Note: Admin client uses the schema configuration from the client creation
// No need for separate schema helpers since the client is configured with the schema