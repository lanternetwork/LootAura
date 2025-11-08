/**
 * Data access helper for sales queries
 * Prefers views when possible, falls back to base table for resilience
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Sale } from '@/lib/types'

export interface SaleListing {
  id: string
  title: string
  updated_at?: string | null
  status?: string | null
  cover_image_url?: string | null
}

export interface DraftListing {
  id: string
  draft_key: string
  title?: string | null
  updated_at?: string | null
  payload: {
    formData?: {
      title?: string
      date_start?: string
      date_end?: string
    }
    photos?: string[]
    items?: Array<{
      id?: string
      name?: string
      category?: string
    }>
  }
}

/**
 * Fetch user's sales (prefers view, falls back to base table)
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to filter by
 * @param limit - Maximum number of results (default: 20)
 * @returns Array of sale listings
 */
export async function getUserSales(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20
): Promise<{ data: Sale[]; source: 'view' | 'base_table'; error?: any }> {
  // Try view first (preferred)
  try {
    const { data: sales, error } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (!error && sales) {
      // Debug: log image data for first sale (always log for debugging)
      if (sales.length > 0) {
        const firstSale = sales[0] as any
        console.log('[SALES_ACCESS] Sample sale image data:', {
          id: firstSale.id,
          title: firstSale.title,
          cover_image_url: firstSale.cover_image_url,
          images: firstSale.images,
          imagesType: typeof firstSale.images,
          imagesIsArray: Array.isArray(firstSale.images),
          imagesLength: Array.isArray(firstSale.images) ? firstSale.images.length : 'N/A',
          allKeys: Object.keys(firstSale),
        })
      }
      return {
        data: sales as Sale[],
        source: 'view',
      }
    }

    // If error is permissions/column related, log and fallback
    if (error) {
      const isPermissionError = 
        error.code === 'PGRST301' || // Missing column
        error.code === '42501' ||    // Insufficient privilege
        error.message?.includes('permission') ||
        error.message?.includes('column') ||
        error.message?.includes('does not exist')

      if (isPermissionError) {
        console.warn('[SALES_ACCESS] View query failed, falling back to base table:', {
          error: error.code,
          message: error.message,
          hint: error.hint,
        })
      } else {
        // Non-permission error, throw it
        throw error
      }
    }
  } catch (error: any) {
    // Check if it's a permission/column error
    const isPermissionError = 
      error?.code === 'PGRST301' ||
      error?.code === '42501' ||
      error?.message?.includes('permission') ||
      error?.message?.includes('column') ||
      error?.message?.includes('does not exist')

    if (!isPermissionError) {
      // Not a permission error, rethrow
      throw error
    }

    console.warn('[SALES_ACCESS] View query failed, falling back to base table:', {
      error: error?.code,
      message: error?.message,
    })
  }

  // Fallback: query base table directly
  try {
    const { data: sales, error } = await supabase
      .from('lootaura_v2.sales')
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) {
      return {
        data: [],
        source: 'base_table',
        error,
      }
    }

    // Log fallback usage for observability
    console.warn('[SALES_ACCESS] Using base-table fallback. View may need attention.', {
      userId,
      count: sales?.length || 0,
    })

    return {
      data: (sales || []) as Sale[],
      source: 'base_table',
    }
  } catch (error) {
    return {
      data: [],
      source: 'base_table',
      error,
    }
  }
}

/**
 * Fetch user's active drafts
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to filter by
 * @param limit - Maximum number of results (default: 12)
 * @param offset - Offset for pagination (default: 0)
 * @returns Array of draft listings
 */
export async function getUserDrafts(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 12,
  offset: number = 0
): Promise<{ data: DraftListing[]; error?: any }> {
  try {
    console.log('[SALES_ACCESS] Fetching drafts for user:', userId, 'limit:', limit, 'offset:', offset)
    
    // Use write client for reading drafts (they're in lootaura_v2 schema)
    const { createSupabaseWriteClient } = await import('@/lib/supabase/server')
    const writeClient = createSupabaseWriteClient()
    
    const { data: drafts, error } = await writeClient
      .from('sale_drafts')
      .select('id, draft_key, title, updated_at, payload')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('[SALES_ACCESS] Error fetching drafts:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId,
      })
      return {
        data: [],
        error,
      }
    }

    console.log('[SALES_ACCESS] Found', drafts?.length || 0, 'drafts for user:', userId)

    // Map to DraftListing format, extracting title from payload if not set
    const mappedDrafts: DraftListing[] = (drafts || []).map((draft: any) => ({
      id: draft.id,
      draft_key: draft.draft_key,
      title: draft.title || draft.payload?.formData?.title || null,
      updated_at: draft.updated_at,
      payload: draft.payload || {},
    }))

    return {
      data: mappedDrafts,
    }
  } catch (error) {
    console.error('[SALES_ACCESS] Unexpected error fetching drafts:', error)
    return {
      data: [],
      error,
    }
  }
}

