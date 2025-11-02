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

function getAdminSupabase(): ReturnType<typeof createClient> {
  if (!_adminSupabase) {
    // Check process.env first to avoid triggering ENV_SERVER validation during build
    const serviceRoleFromEnv = process.env.SUPABASE_SERVICE_ROLE
    
    if (serviceRoleFromEnv) {
      // Use service role from process.env directly (available at runtime)
      _adminSupabase = createClient(
        ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleFromEnv,
        { 
          auth: { 
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      )
    } else {
      // During build time or if not in process.env, try ENV_SERVER
      // This may fail during build, so create a placeholder for type checking
      try {
        const envServiceRole = ENV_SERVER.SUPABASE_SERVICE_ROLE
        if (!envServiceRole) {
          throw new Error('Missing SUPABASE_SERVICE_ROLE for admin client')
        }
        
        _adminSupabase = createClient(
          ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL,
          envServiceRole,
          { 
            auth: { 
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            }
          }
        )
      } catch {
        // During build, create placeholder client just for TypeScript type checking
        // This allows the build to succeed while maintaining correct types
        _adminSupabase = createClient(
          ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
          'placeholder-key-for-build-type-checking-only',
          { 
            auth: { 
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            }
          }
        )
      }
    }
  }
  return _adminSupabase
}

// Check if we're in a build context - Next.js sets NEXT_PHASE during build
const isBuildTime = typeof process !== 'undefined' && 
  (process.env.NEXT_PHASE === 'phase-production-build' || 
   process.env.NEXT_PHASE === 'phase-development-build')

// During build, create a stub client just for type checking
// This allows TypeScript to infer types correctly without validating env vars
const stubClient = isBuildTime ? createClient(
  ENV_PUBLIC.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  'build-time-stub-key',
  { 
    auth: { 
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
) : null

// Create a Proxy that uses stub during build and lazy initialization at runtime
const adminSupabaseProxy = new Proxy(
  (stubClient || {}) as ReturnType<typeof createClient>,
  {
    get(_target, prop) {
      // During build, return properties from stub client
      if (stubClient && isBuildTime) {
        const value = (stubClient as any)[prop]
        if (typeof value === 'function') {
          return value.bind(stubClient)
        }
        return value
      }
      
      // At runtime, get the real client lazily
      const client = getAdminSupabase()
      const value = (client as any)[prop]
      if (typeof value === 'function') {
        return value.bind(client)
      }
      return value
    }
  }
)

// Export - during build TypeScript sees the stub client type, at runtime uses Proxy
export const adminSupabase = adminSupabaseProxy

// Note: Admin client uses the schema configuration from the client creation
// No need for separate schema helpers since the client is configured with the schema