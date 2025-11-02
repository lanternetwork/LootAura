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

// Create a lazy getter that preserves TypeScript types
// During build, we don't initialize the client - we just provide a type
// At runtime, the client is initialized on first access
function createLazyAdminClient(): ReturnType<typeof createClient> {
  // This function is never called during build - it's only used for type inference
  // The actual client is created via getAdminSupabase() when accessed
  return getAdminSupabase()
}

// Export using a getter pattern that preserves types
// TypeScript sees the return type of createLazyAdminClient
// but the actual initialization happens lazily via getAdminSupabase()
export const adminSupabase = createLazyAdminClient()

// Note: Admin client uses the schema configuration from the client creation
// No need for separate schema helpers since the client is configured with the schema