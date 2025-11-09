/**
 * Data access helper for sales queries
 * Prefers views when possible, falls back to base table for resilience
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Sale, SaleItem } from '@/lib/types'
import type { SaleWithOwnerInfo } from '@/lib/data/sales'

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
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[SALES_ACCESS] View query failed, falling back to base table:', {
            error: error.code,
            message: error.message,
            hint: error.hint,
          })
        }
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

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[SALES_ACCESS] View query failed, falling back to base table:', {
        error: error?.code,
        message: error?.message,
      })
    }
  }

  // Fallback: query base table directly using schema-scoped client
  try {
    const { getRlsDb, fromBase } = await import('@/lib/supabase/clients')
    const db = getRlsDb()
    const { data: sales, error } = await fromBase(db, 'sales')
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

    // Log fallback usage for observability (dev only)
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[SALES_ACCESS] Using base-table fallback. View may need attention.', {
        userId,
        count: sales?.length || 0,
      })
    }

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
      if (process.env.NODE_ENV !== 'production') {
        console.error('[SALES_ACCESS] Error fetching drafts:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId,
        })
      }
      return {
        data: [],
        error,
      }
    }

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
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SALES_ACCESS] Unexpected error fetching drafts:', error)
    }
    return {
      data: [],
      error,
    }
  }
}

/**
 * Fetch items for a sale (for sale details page)
 * Reads from public.items_v2 view (reads from views allowed)
 * @param supabase - Authenticated Supabase client
 * @param saleId - Sale ID to fetch items for
 * @param limit - Maximum number of items to return (default: 100)
 * @returns Array of sale items, or empty array on error
 */
export async function getItemsForSale(
  supabase: SupabaseClient,
  saleId: string,
  limit: number = 100
): Promise<SaleItem[]> {
  try {
    // Read from view (reads allowed) - select both images and image_url for compatibility
    const { data: items, error } = await supabase
      .from('items_v2')
      .select('id, sale_id, name, category, price, images, image_url, created_at, updated_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[SALES_ACCESS] Error fetching items for sale:', error)
      }
      return []
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SALES_ACCESS] getItemsForSale result:', {
        saleId,
        itemsCount: items?.length || 0,
        items,
      })
    }

    // Map items to SaleItem type
    // Normalize images: guarantee images: string[] with fallback to image_url
    const mappedItems: SaleItem[] = ((items || []) as any[]).map((item: any) => {
      // Normalize images: prefer images array, fallback to image_url
      const images: string[] = Array.isArray(item.images) && item.images.length > 0
        ? item.images.filter((url: any): url is string => typeof url === 'string')
        : (item.image_url ? [item.image_url] : [])
      
      // Log dev-only fallback when using image_url
      if (process.env.NODE_ENV !== 'production' && item.image_url && (!item.images || !Array.isArray(item.images) || item.images.length === 0)) {
        console.log('[SALES_ACCESS] Item image fallback (image_url → images[]):', {
          itemId: item.id,
          itemName: item.name,
          hadImageUrl: !!item.image_url,
          hadImages: !!item.images,
          imagesCount: images.length,
        })
      }
      
      // Log dev-only when item has neither images nor image_url
      if (process.env.NODE_ENV !== 'production' && images.length === 0) {
        console.log('[SALES_ACCESS] Item has no images:', {
          itemId: item.id,
          itemName: item.name,
          hadImageUrl: !!item.image_url,
          hadImages: !!item.images,
        })
      }
      
      return {
        id: item.id,
        sale_id: item.sale_id,
        name: item.name,
        category: item.category || undefined,
        condition: item.condition || undefined,
        price: item.price || undefined,
        photo: images.length > 0 ? images[0] : undefined, // Use first image as photo
        purchased: item.is_sold || false, // is_sold may not exist in view, default to false
        created_at: item.created_at,
      }
    })

    return mappedItems
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SALES_ACCESS] Unexpected error in getItemsForSale:', error)
    }
    return []
  }
}

/**
 * Fetch sale with its items (for sale details page)
 * Reads sale from public.sales_v2 view and items from public.items_v2 view
 * Also fetches owner profile and stats to match SaleWithOwnerInfo type
 * @param supabase - Authenticated Supabase client
 * @param saleId - Sale ID to fetch
 * @returns Sale with owner info and items, or null if sale not found
 */
export async function getSaleWithItems(
  supabase: SupabaseClient,
  saleId: string
): Promise<{ sale: SaleWithOwnerInfo; items: SaleItem[] } | null> {
  try {
    // Read sale from view (public.sales_v2)
    const { data: sale, error: saleError } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('id', saleId)
      .single()

    if (saleError || !sale) {
      if (saleError?.code === 'PGRST116') {
        return null // No rows returned
      }
      if (process.env.NODE_ENV !== 'production') {
        console.error('[SALES_ACCESS] Error fetching sale:', saleError)
      }
      return null
    }

    // Fetch tags from base table (view doesn't include tags column)
    // PostgREST doesn't support cross-schema queries when client is configured for 'public' schema
    // We'll gracefully handle this and continue without sale-level tags
    // Categories will still work from item categories
    let tags: string[] = []
    
    try {
      // Try to use admin client if available (service role key bypasses RLS)
      // Use schema-scoped client for tags query
      const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
      const admin = getAdminDb()
      const tagsRes = await fromBase(admin, 'sales')
        .select('tags')
        .eq('id', saleId)
        .maybeSingle()
      
      if (!tagsRes.error && tagsRes.data) {
        // Type assertion needed because admin client types may not be fully inferred
        const data = tagsRes.data as { tags?: string[] | null } | null
        if (data && Array.isArray(data.tags)) {
          tags = data.tags
        }
      } else if (tagsRes.error) {
        console.log('[SALES_ACCESS] Admin client tags query failed (schema limitation):', {
          saleId,
          error: tagsRes.error.message,
        })
      }
    } catch (error) {
      // Admin client not available or failed - that's okay, we'll continue without tags
      console.log('[SALES_ACCESS] Could not fetch tags (admin client not available or failed):', {
        saleId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    
    // Always log in production for debugging (can remove later)
    console.log('[SALES_ACCESS] Tags fetch result:', {
      saleId,
      tagsCount: tags.length,
      tags,
      note: 'Categories will still work from item categories if tags are empty',
    })
    
    const saleWithTags = {
      ...(sale as Sale),
      tags,
    }

    if (!sale.owner_id) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[SALES_ACCESS] Sale found but missing owner_id')
      }
      return {
        sale: {
          ...saleWithTags,
          owner_profile: null,
          owner_stats: {
            total_sales: 0,
            avg_rating: 5.0,
            ratings_count: 0,
            last_sale_at: null,
          },
        } as SaleWithOwnerInfo,
        items: [],
      }
    }

    const ownerId = sale.owner_id

    // Fetch owner profile, stats, and items in parallel
    // (tags already fetched above)
    const [profileRes, statsRes, itemsRes] = await Promise.all([
      supabase
        .from('profiles_v2')
        .select('id, created_at, full_name')
        .eq('id', ownerId)
        .maybeSingle(),
      supabase
        .from('owner_stats')
        .select('user_id, total_sales, last_sale_at, avg_rating, ratings_count')
        .eq('user_id', ownerId)
        .maybeSingle(),
      supabase
        .from('items_v2')
        .select('id, sale_id, name, category, price, image_url, created_at, updated_at')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false }),
    ])

    // Log errors but don't fail - return with defaults
    if (profileRes.error && process.env.NODE_ENV !== 'production') {
      console.error('[SALES_ACCESS] Error fetching owner profile:', profileRes.error)
    }
    if (statsRes.error && process.env.NODE_ENV !== 'production') {
      console.error('[SALES_ACCESS] Error fetching owner stats:', statsRes.error)
    }
    if (itemsRes.error) {
      // Always log errors (not just in dev) since this is critical
      console.error('[SALES_ACCESS] Error fetching items:', {
        saleId,
        error: itemsRes.error,
        code: itemsRes.error?.code,
        message: itemsRes.error?.message,
      })
    }
    
    // Always log in production for debugging (can remove later)
    console.log('[SALES_ACCESS] Items fetch result:', {
      saleId,
      itemsResError: itemsRes.error ? {
        code: itemsRes.error.code,
        message: itemsRes.error.message,
      } : null,
      itemsCount: itemsRes.data?.length || 0,
      items: itemsRes.data?.map(i => ({ id: i.id, name: i.name, category: i.category })), // Log summary only
      // Debug: Check if sale status might be blocking items
      saleStatus: sale.status,
    })
    
    // Additional debug: Try to query items using admin client via items_v2 view
    // This helps diagnose if items exist but are being filtered by RLS
    // Admin client bypasses RLS, so if it finds items but regular query doesn't, it's an RLS issue
    if (itemsRes.data?.length === 0) {
      try {
        const adminModule = await import('@/lib/supabase/admin').catch(() => null)
        if (adminModule?.adminSupabase) {
          // Query via items_v2 view (admin client can access it and bypasses RLS on base table)
          const adminItemsRes = await adminModule.adminSupabase
            .from('items_v2')
            .select('id, sale_id, name, category')
            .eq('sale_id', saleId)
            .limit(10)
          
          // Type assertion needed because admin client types may not be fully inferred
          const adminItems = adminItemsRes.data as Array<{ id: string; sale_id: string; name: string; category: string | null }> | null
          
          console.log('[SALES_ACCESS] Admin client items check (bypasses RLS):', {
            saleId,
            adminItemsCount: adminItems?.length || 0,
            adminItemsError: adminItemsRes.error ? {
              code: adminItemsRes.error.code,
              message: adminItemsRes.error.message,
            } : null,
            adminItems: adminItems?.map(i => ({ id: i.id, name: i.name, category: i.category })),
            note: 'If admin finds items but regular query returns 0, there may be an RLS issue',
          })
        }
      } catch (error) {
        console.log('[SALES_ACCESS] Could not check items via admin client:', {
          saleId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Map items to SaleItem type
    // Handle both image_url (production) and images (array) formats
    const mappedItems: SaleItem[] = ((itemsRes.data || []) as any[]).map((item: any) => ({
      id: item.id,
      sale_id: item.sale_id,
      name: item.name,
      category: item.category || undefined,
      condition: item.condition || undefined,
      price: item.price || undefined,
      photo: item.image_url || (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : undefined),
      purchased: item.is_sold || false, // is_sold may not exist in view, default to false
      created_at: item.created_at,
    }))

    return {
      sale: {
        ...saleWithTags,
        owner_profile: profileRes.data ?? null,
        owner_stats: statsRes.data ?? {
          total_sales: 0,
          avg_rating: 5.0,
          ratings_count: 0,
          last_sale_at: null,
        },
      } as SaleWithOwnerInfo,
      items: mappedItems,
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SALES_ACCESS] Unexpected error in getSaleWithItems:', error)
    }
    return null
  }
}

