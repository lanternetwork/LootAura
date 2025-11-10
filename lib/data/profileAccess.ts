/**
 * Server-side data access helpers for profile, metrics, and preferences
 * All functions are designed for RSC (React Server Components) usage
 */

import { SupabaseClient } from '@supabase/supabase-js'

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
  series?: {
    date: string
    views: number
    saves: number
    clicks: number
    fulfilled: number
  }[]
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
  try {
    // Calculate date range (last 7 days)
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - 7)

    // Query analytics events from the view (which reads from base table)
    const { data: events, error: eventsError } = await supabase
      .from('analytics_events_v2')
      .select('event_type, ts')
      .eq('owner_id', userId)
      .eq('is_test', false)
      .gte('ts', from.toISOString())
      .lte('ts', to.toISOString())
      .order('ts', { ascending: true })

    // If table doesn't exist or query fails, return defaults
    if (eventsError) {
      const errorCode = (eventsError as any)?.code
      if (errorCode === '42P01' || errorCode === 'PGRST116') {
        // Table doesn't exist - return defaults
        return {
          views7d: 0,
          saves7d: 0,
          ctr7d: 0,
          salesFulfilled: 0,
          series: [],
        }
      }
      // Other error - log and return defaults
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[PROFILE_ACCESS] Error fetching analytics events:', eventsError)
      }
      return {
        views7d: 0,
        saves7d: 0,
        ctr7d: 0,
        salesFulfilled: 0,
        series: [],
      }
    }

    // Query fulfilled sales (completed sales) from the last 7 days
    const { data: sales, error: salesError } = await supabase
      .from('sales_v2')
      .select('id, updated_at')
      .eq('owner_id', userId)
      .eq('status', 'completed')
      .gte('updated_at', from.toISOString())
      .lte('updated_at', to.toISOString())

    // Count events by type
    const views7d = events?.filter(e => e.event_type === 'view').length || 0
    const saves7d = events?.filter(e => e.event_type === 'save').length || 0
    const clicks7d = events?.filter(e => e.event_type === 'click').length || 0

    // Calculate CTR (Click-Through Rate): clicks / views * 100
    const ctr7d = views7d > 0 ? (clicks7d / views7d) * 100 : 0
    const salesFulfilled = salesError ? 0 : (sales?.length || 0)

    // Build daily time series
    const seriesMap = new Map<string, { views: number; saves: number; clicks: number; fulfilled: number }>()
    
    // Initialize all 7 days with zeros
    for (let i = 0; i < 7; i++) {
      const date = new Date(from)
      date.setDate(date.getDate() + i)
      const dateStr = date.toISOString().split('T')[0]
      seriesMap.set(dateStr, { views: 0, saves: 0, clicks: 0, fulfilled: 0 })
    }

    // Aggregate events by date
    events?.forEach((event: any) => {
      const date = new Date(event.ts).toISOString().split('T')[0]
      if (seriesMap.has(date)) {
        const dayData = seriesMap.get(date)!
        if (event.event_type === 'view') dayData.views++
        if (event.event_type === 'save') dayData.saves++
        if (event.event_type === 'click') dayData.clicks++
      }
    })

    // Aggregate fulfilled sales by date
    sales?.forEach((sale: any) => {
      const date = new Date(sale.updated_at).toISOString().split('T')[0]
      if (seriesMap.has(date)) {
        seriesMap.get(date)!.fulfilled++
      }
    })

    // Convert to array and sort by date
    const series = Array.from(seriesMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      views7d,
      saves7d,
      ctr7d,
      salesFulfilled,
      series,
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PROFILE_ACCESS] Error fetching metrics:', error)
    }
    // Return defaults on error
    return {
      views7d: 0,
      saves7d: 0,
      ctr7d: 0,
      salesFulfilled: 0,
    }
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
    const { data } = await supabase
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

