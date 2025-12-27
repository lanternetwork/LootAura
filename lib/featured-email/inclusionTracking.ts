/**
 * Featured Inclusion Tracking
 * Server-only module for tracking which sales were featured to which recipients
 * 
 * Purpose:
 * - Fairness rotation (avoid showing same promoted sale to same recipient repeatedly)
 * - Seller reporting ("featured to X users")
 */

import { getAdminDb, fromBase } from '@/lib/supabase/clients'

export interface InclusionRecord {
  saleId: string
  recipientProfileId: string
  weekKey: string
  timesShown: number
}

/**
 * Record featured inclusions for a batch of sales/recipients
 * Updates both recipient-level and rollup tables
 * 
 * @param inclusions - Array of inclusion records
 */
export async function recordInclusions(
  inclusions: Array<{
    saleId: string
    recipientProfileId: string
    weekKey: string
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getAdminDb()
    const now = new Date().toISOString()

    // Batch upsert recipient-level inclusions
    const recipientInserts = inclusions.map((inc) => ({
      sale_id: inc.saleId,
      recipient_profile_id: inc.recipientProfileId,
      week_key: inc.weekKey,
      times_shown: 1,
      last_shown_at: now,
      updated_at: now,
    }))

    // Use upsert with conflict handling (increment times_shown if exists)
    for (const insert of recipientInserts) {
      // Check if exists
      const { data: existing } = await fromBase(admin, 'featured_inclusions')
        .select('id, times_shown')
        .eq('sale_id', insert.sale_id)
        .eq('recipient_profile_id', insert.recipient_profile_id)
        .eq('week_key', insert.week_key)
        .maybeSingle()

      if (existing) {
        // Increment times_shown
        await fromBase(admin, 'featured_inclusions')
          .update({
            times_shown: (existing.times_shown || 0) + 1,
            last_shown_at: now,
            updated_at: now,
          })
          .eq('id', existing.id)
      } else {
        // Insert new
        await fromBase(admin, 'featured_inclusions').insert(insert)
      }
    }

    // Update rollups (aggregate by sale_id)
    const saleIdSet = new Set(inclusions.map((inc) => inc.saleId))
    for (const saleId of saleIdSet) {
      // Count unique recipients for this sale (across all weeks)
      const { data: uniqueRecipients } = await fromBase(admin, 'featured_inclusions')
        .select('recipient_profile_id')
        .eq('sale_id', saleId)

      // Get unique recipient count
      const uniqueRecipientSet = new Set(
        uniqueRecipients?.map((r) => r.recipient_profile_id) || []
      )
      const uniqueCount = uniqueRecipientSet.size

      // Count total inclusions for this sale (sum of all times_shown)
      const { data: totalInclusions } = await fromBase(admin, 'featured_inclusions')
        .select('times_shown')
        .eq('sale_id', saleId)

      const totalCount = totalInclusions?.reduce((sum, inc) => sum + (inc.times_shown || 0), 0) || 0

      // Upsert rollup
      const { data: existingRollup } = await fromBase(admin, 'featured_inclusion_rollups')
        .select('id')
        .eq('sale_id', saleId)
        .maybeSingle()

      if (existingRollup) {
        // Update rollup
        await fromBase(admin, 'featured_inclusion_rollups')
          .update({
            unique_recipients_total: uniqueCount,
            total_inclusions_total: totalCount,
            last_featured_at: now,
            updated_at: now,
          })
          .eq('sale_id', saleId)
      } else {
        // Insert new rollup
        await fromBase(admin, 'featured_inclusion_rollups')
          .insert({
            sale_id: saleId,
            unique_recipients_total: uniqueCount,
            total_inclusions_total: totalCount,
            last_featured_at: now,
            updated_at: now,
          })
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[INCLUSION_TRACKING] Error recording inclusions:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get inclusion rollup for a sale (for seller reporting)
 * 
 * @param saleId - Sale ID
 * @returns Rollup data or null
 */
export async function getInclusionRollup(saleId: string): Promise<{
  uniqueRecipientsTotal: number
  totalInclusionsTotal: number
  lastFeaturedAt: string | null
} | null> {
  try {
    const admin = getAdminDb()
    const { data, error } = await fromBase(admin, 'featured_inclusion_rollups')
      .select('unique_recipients_total, total_inclusions_total, last_featured_at')
      .eq('sale_id', saleId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return {
      uniqueRecipientsTotal: data.unique_recipients_total || 0,
      totalInclusionsTotal: data.total_inclusions_total || 0,
      lastFeaturedAt: data.last_featured_at || null,
    }
  } catch (error: any) {
    console.error('[INCLUSION_TRACKING] Error fetching rollup:', error)
    return null
  }
}

