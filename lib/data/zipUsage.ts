/**
 * ZIP usage tracking for featured email selection
 * Server-only module for tracking and querying user ZIP code usage
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

/**
 * Increment ZIP usage count for a user
 * This is called when a user interacts with a ZIP code (e.g., searches, views map)
 * 
 * Rate limiting: At most once per day per user per ZIP (to reduce DB writes)
 * 
 * @param profileId - User profile ID
 * @param zip - Normalized ZIP code (5 digits)
 * @returns Success status
 */
export async function incrementZipUsage(
  profileId: string,
  zip: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate ZIP format (must be 5 digits)
    if (!/^\d{5}$/.test(zip)) {
      return { success: false, error: 'Invalid ZIP format' }
    }

    const admin = getAdminDb()
    const now = new Date().toISOString()

    // Check if row exists
    const { data: existing } = await fromBase(admin, 'profile_zip_usage')
      .select('id, use_count, last_seen_at')
      .eq('profile_id', profileId)
      .eq('zip', zip)
      .maybeSingle()

    if (existing) {
      // Check if we should update (at least 24 hours since last update)
      const lastSeen = new Date(existing.last_seen_at)
      const hoursSinceLastSeen = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60)

      if (hoursSinceLastSeen >= 24) {
        // Update: increment use_count and update last_seen_at
        const { error: updateError } = await fromBase(admin, 'profile_zip_usage')
          .update({
            use_count: (existing.use_count || 0) + 1,
            last_seen_at: now,
            updated_at: now,
          })
          .eq('profile_id', profileId)
          .eq('zip', zip)

        if (updateError) {
          console.error('[ZIP_USAGE] Error incrementing use_count:', updateError)
          return { success: false, error: updateError.message }
        }
      }
      // If less than 24 hours, skip update (rate limiting)
    } else {
      // Row doesn't exist, insert new
      const { error: insertError } = await fromBase(admin, 'profile_zip_usage')
        .insert({
          profile_id: profileId,
          zip,
          use_count: 1,
          last_seen_at: now,
          updated_at: now,
        })

      if (insertError) {
        console.error('[ZIP_USAGE] Error inserting new ZIP usage:', insertError)
        return { success: false, error: insertError.message }
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[ZIP_USAGE] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get primary ZIP code for a user
 * Primary ZIP = highest use_count, tie-break by last_seen_at DESC
 * 
 * @param profileId - User profile ID
 * @returns Primary ZIP code or null
 */
export async function getPrimaryZip(
  profileId: string
): Promise<string | null> {
  try {
    const admin = getAdminDb()
    const { data, error } = await fromBase(admin, 'profile_zip_usage')
      .select('zip')
      .eq('profile_id', profileId)
      .order('use_count', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[ZIP_USAGE] Error fetching primary ZIP:', error)
      return null
    }

    return data?.zip || null
  } catch (error: any) {
    console.error('[ZIP_USAGE] Unexpected error fetching primary ZIP:', error)
    return null
  }
}

