/**
 * Data access helper for sales queries
 * Prefers views when possible, falls back to base table for resilience
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface SaleListing {
  id: string
  title: string
  updated_at?: string | null
  status?: string | null
  cover_image_url?: string | null
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
): Promise<{ data: SaleListing[]; source: 'view' | 'base_table'; error?: any }> {
  // Try view first (preferred)
  try {
    const { data: sales, error } = await supabase
      .from('sales_v2')
      .select('id, title, updated_at, status, cover_image_url')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (!error && sales) {
      return {
        data: sales.map((sale: any) => ({
          id: sale.id,
          title: sale.title,
          updated_at: sale.updated_at,
          status: sale.status,
          cover_image_url: sale.cover_image_url,
        })),
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
      .select('id, title, updated_at, status, cover_image_url')
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

    // Runtime assertion: verify required columns exist
    if (sales && sales.length > 0) {
      const firstSale = sales[0]
      const requiredColumns = ['id', 'title', 'updated_at', 'status', 'cover_image_url']
      const missingColumns = requiredColumns.filter(col => !(col in firstSale))
      
      if (missingColumns.length > 0) {
        console.error('[SALES_ACCESS] Missing required columns in base table response:', missingColumns)
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
      }
    }

    // Log fallback usage for observability
    console.warn('[SALES_ACCESS] Using base-table fallback. View may need attention.', {
      userId,
      count: sales?.length || 0,
    })

    return {
      data: (sales || []).map((sale: any) => ({
        id: sale.id,
        title: sale.title,
        updated_at: sale.updated_at,
        status: sale.status,
        cover_image_url: sale.cover_image_url,
      })),
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

