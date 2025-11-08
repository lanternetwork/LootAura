/**
 * Server-side data access helpers for profile, metrics, and preferences
 * All functions are designed for RSC (React Server Components) usage
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface ProfileData {
  id: string
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  location_city?: string | null
  location_region?: string | null
  created_at?: string | null
  verified?: boolean | null
}

export interface Metrics7d {
  views7d?: number
  saves7d?: number
  ctr7d?: number
  salesFulfilled?: number
}

export interface UserPreferences {
  theme?: string
  units?: string
  default_radius_km?: number
  email_opt_in?: boolean
}

/**
 * Fetch user profile data (SSR)
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to fetch profile for
 * @returns Profile data or null if not found
 */
export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileData | null> {
  try {
    // Try profiles_v2 view first
    const { data, error } = await supabase
      .from('profiles_v2')
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified')
      .eq('id', userId)
      .maybeSingle()

    if (data && !error) {
      return data as ProfileData
    }

    // Fallback to RPC if view doesn't return data
    if (!data && !error) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_profile', { p_user_id: userId })
        if (rpcData && !rpcError) {
          const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData
          return parsed as ProfileData
        }
      } catch (e) {
        // RPC failed, continue to return null
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[PROFILE_ACCESS] RPC fallback failed:', e)
        }
      }
    }

    return null
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PROFILE_ACCESS] Error fetching profile:', error)
    }
    return null
  }
}

/**
 * Fetch user metrics for last 7 days (SSR)
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to fetch metrics for
 * @returns Metrics data with defaults if not available
 */
export async function getUserMetrics7d(
  supabase: SupabaseClient,
  userId: string
): Promise<Metrics7d> {
  // TODO: Implement real 7-day metrics aggregation
  // For now, return defaults matching the API stub
  // The metrics API (/api/profile/metrics) currently returns stub data
  // Once real metrics are implemented, query from analytics/events tables
  return {
    views7d: 0,
    saves7d: 0,
    ctr7d: 0,
    salesFulfilled: 0,
  }
}

/**
 * Fetch user preferences (SSR)
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to fetch preferences for
 * @returns Preferences data or defaults
 */
export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPreferences> {
  try {
    // Fetch from user_preferences table
    const { data, error } = await supabase
      .from('user_preferences')
      .select('theme, units')
      .eq('user_id', userId)
      .maybeSingle()

    // Fetch from seller_settings for radius and email opt-in
    // Try public view first, fallback to write client if needed
    let settings: any = null
    try {
      const { data: viewSettings } = await supabase
        .from('seller_settings')
        .select('default_radius_km, email_opt_in')
        .eq('user_id', userId)
        .maybeSingle()
      settings = viewSettings
    } catch {
      // If view doesn't exist, try write client
      try {
        const { createSupabaseWriteClient } = await import('@/lib/supabase/server')
        const writeClient = createSupabaseWriteClient()
        const { data: writeSettings } = await writeClient
          .from('seller_settings')
          .select('default_radius_km, email_opt_in')
          .eq('user_id', userId)
          .maybeSingle()
        settings = writeSettings
      } catch {
        // Ignore errors, use defaults
      }
    }

    return {
      theme: data?.theme || 'system',
      units: data?.units || 'imperial',
      default_radius_km: settings?.default_radius_km ?? 10,
      email_opt_in: settings?.email_opt_in ?? false,
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PROFILE_ACCESS] Error fetching preferences:', error)
    }
    // Return defaults on error
    return {
      theme: 'system',
      units: 'imperial',
      default_radius_km: 10,
      email_opt_in: false,
    }
  }
}

