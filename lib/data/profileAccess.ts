/**
 * Server-side data access helpers for profile, metrics, and preferences
 * All functions are designed for RSC (React Server Components) usage
 */

import { SupabaseClient } from '@supabase/supabase-js'

import type { SocialLinks } from '@/lib/profile/social'

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
  social_links?: SocialLinks | null
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
      .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, social_links')
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
    // Calculate date range (last 7 days including today)
    // We want 7 days total: today and the 6 days before it
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - 6) // 6 days ago + today = 7 days total

    // Query analytics events from the view (which reads from base table)
    // Include test events in debug mode for testing purposes
    const includeTestEvents = process.env.NEXT_PUBLIC_DEBUG === 'true'
    let eventsQuery = supabase
      .from('analytics_events_v2')
      .select('event_type, ts')
      .eq('owner_id', userId)
      .gte('ts', from.toISOString())
      .lte('ts', to.toISOString())
      .order('ts', { ascending: true })
    
    // Filter out test events unless in debug mode
    if (!includeTestEvents) {
      eventsQuery = eventsQuery.eq('is_test', false)
    }
    
    const { data: events, error: eventsError } = await eventsQuery

    // If table doesn't exist or query fails, return defaults
    if (eventsError) {
      const errorCode = (eventsError as any)?.code
      const errorMessage = (eventsError as any)?.message || 'Unknown error'
      const errorDetails = (eventsError as any)?.details || ''
      const errorHint = (eventsError as any)?.hint || ''
      
      // Log detailed error information
      console.error('[PROFILE_ACCESS] Error fetching analytics events:', {
        code: errorCode,
        message: errorMessage,
        details: errorDetails,
        hint: errorHint,
        userId,
        from: from.toISOString(),
        to: to.toISOString(),
        fullError: eventsError,
      })
      
      if (errorCode === '42P01' || errorCode === 'PGRST116') {
        // Table/view doesn't exist - return defaults
        console.warn('[PROFILE_ACCESS] Analytics events view does not exist, returning defaults')
        return {
          views7d: 0,
          saves7d: 0,
          ctr7d: 0,
          salesFulfilled: 0,
          series: [],
        }
      }
      // Other error - log and return defaults
      return {
        views7d: 0,
        saves7d: 0,
        ctr7d: 0,
        salesFulfilled: 0,
        series: [],
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE_ACCESS] Analytics events fetched:', {
        userId,
        eventCount: events?.length || 0,
        from: from.toISOString(),
        to: to.toISOString(),
        events: events?.slice(0, 5), // Log first 5 events for debugging
      })
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
    
    // Initialize all 7 days with zeros (from oldest to newest)
    for (let i = 0; i < 7; i++) {
      const date = new Date(from)
      date.setDate(date.getDate() + i)
      // Use UTC date to avoid timezone issues
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      const day = String(date.getUTCDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      seriesMap.set(dateStr, { views: 0, saves: 0, clicks: 0, fulfilled: 0 })
    }

    // Aggregate events by date
    events?.forEach((event: any) => {
      if (!event.ts) return
      
      // Parse event timestamp and get date string in YYYY-MM-DD format
      const eventDate = new Date(event.ts)
      const year = eventDate.getUTCFullYear()
      const month = String(eventDate.getUTCMonth() + 1).padStart(2, '0')
      const day = String(eventDate.getUTCDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      
      if (seriesMap.has(dateStr)) {
        const dayData = seriesMap.get(dateStr)!
        if (event.event_type === 'view') dayData.views++
        if (event.event_type === 'save') dayData.saves++
        if (event.event_type === 'click') dayData.clicks++
      } else {
        // Log if event date doesn't match any series date (shouldn't happen)
        console.warn('[PROFILE_ACCESS] Event date not in series range:', {
          eventDate: dateStr,
          eventTs: event.ts,
          seriesDates: Array.from(seriesMap.keys()),
        })
      }
    })

    // Aggregate fulfilled sales by date
    sales?.forEach((sale: any) => {
      if (!sale.updated_at) return
      
      // Parse sale updated_at and get date string in YYYY-MM-DD format (UTC)
      const saleDate = new Date(sale.updated_at)
      const year = saleDate.getUTCFullYear()
      const month = String(saleDate.getUTCMonth() + 1).padStart(2, '0')
      const day = String(saleDate.getUTCDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      
      if (seriesMap.has(dateStr)) {
        seriesMap.get(dateStr)!.fulfilled++
      }
    })

    // Convert to array and sort by date
    const series = Array.from(seriesMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE_ACCESS] Series data:', {
        userId,
        seriesLength: series.length,
        series: series.map(s => ({ date: s.date, views: s.views, saves: s.saves, clicks: s.clicks })),
        views7d,
        saves7d,
        clicks7d,
      })
    }

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

