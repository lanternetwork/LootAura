/**
 * Data access helper for sales queries
 * Prefers views when possible, falls back to base table for resilience
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Sale, SaleItem } from '@/lib/types'
import type { SaleWithOwnerInfo } from '@/lib/data/sales'
import type { DraftRecord } from '@/lib/drafts/computePublishability'

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
  publishability?: {
    isPublishable: boolean
    blockingErrors: Record<string, string>
  }
}

/**
 * Fetch user's sales (prefers view, falls back to base table)
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to filter by
 * @param limit - Maximum number of results (default: 20)
 * @returns Array of sale listings
 */
function filterArchivedWindow(sales: Sale[]): Sale[] {
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)

  return (sales || []).filter((sale) => {
    if (sale.status !== 'archived') return true

    const archivedAt = sale.archived_at ? new Date(sale.archived_at) : null
    if (archivedAt && archivedAt >= cutoff) return true

    const dateEnd = sale.date_end ? new Date(`${sale.date_end}T00:00:00Z`) : null
    if (dateEnd && dateEnd >= cutoff) return true

    // Hide archived sales older than 1 year
    return false
  })
}

export interface GetUserSalesOptions {
  statusFilter?: 'active' | 'archived' | 'all'
  limit?: number
}

export async function getUserSales(
  supabase: SupabaseClient,
  userId: string,
  limitOrOptions: number | GetUserSalesOptions = 20
): Promise<{ data: Sale[]; source: 'view' | 'base_table'; error?: any }> {
  // Handle both old signature (limit: number) and new signature (options: GetUserSalesOptions)
  const options: GetUserSalesOptions = typeof limitOrOptions === 'number'
    ? { limit: limitOrOptions }
    : limitOrOptions
  
  const limit = options.limit ?? 20
  const statusFilter = options.statusFilter ?? 'active'

  // Calculate 1-year cutoff for archived sales
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0] // YYYY-MM-DD format

  // Try view first (preferred)
  try {
    let query = supabase
      .from('sales_v2')
      .select('*')
      .eq('owner_id', userId)

    // Apply status filter server-side
    if (statusFilter === 'archived') {
      // Only archived sales within 1-year window
      query = query
        .eq('status', 'archived')
        .or(`archived_at.gte.${oneYearAgoStr},date_end.gte.${oneYearAgoStr}`)
    } else if (statusFilter === 'active') {
      // Only active/published sales (not archived)
      query = query
        .in('status', ['published', 'active'])
        .is('archived_at', null)
    }
    // else 'all' - no status filter (but still apply 1-year window for archived)

    query = query
      .order('updated_at', { ascending: false })
      .limit(limit)

    const { data: sales, error } = await query

    if (!error && sales) {
      // For 'all' status, still apply 1-year window filter client-side for archived sales
      const filtered = statusFilter === 'all' 
        ? filterArchivedWindow(sales as Sale[])
        : (sales as Sale[])
      return {
        data: filtered,
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          const { logger } = await import('@/lib/log')
          logger.debug('[SALES_ACCESS] View query failed, falling back to base table', {
            component: 'salesAccess',
            operation: 'getUserSales',
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

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('[SALES_ACCESS] View query failed, falling back to base table', {
        component: 'salesAccess',
        operation: 'getUserSales',
        error: error?.code,
        message: error?.message,
      })
    }
  }

  // Fallback: query base table directly using schema-scoped client
  try {
    const { getRlsDb, fromBase } = await import('@/lib/supabase/clients')
    const db = await getRlsDb()
    let query = fromBase(db, 'sales')
      .select('*')
      .eq('owner_id', userId)

    // Apply status filter server-side
    if (statusFilter === 'archived') {
      // Only archived sales within 1-year window
      query = query
        .eq('status', 'archived')
        .or(`archived_at.gte.${oneYearAgoStr},date_end.gte.${oneYearAgoStr}`)
    } else if (statusFilter === 'active') {
      // Only active/published sales (not archived)
      query = query
        .in('status', ['published', 'active'])
        .is('archived_at', null)
    }
    // else 'all' - no status filter (but still apply 1-year window for archived)

    const { data: sales, error } = await query
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) {
      return {
        data: [],
        source: 'base_table',
        error,
      }
    }

    // For 'all' status, still apply 1-year window filter client-side for archived sales
    const filtered = statusFilter === 'all' 
      ? filterArchivedWindow((sales || []) as Sale[])
      : ((sales || []) as Sale[])
    
    // Log fallback usage for observability (debug only)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('[SALES_ACCESS] Using base-table fallback. View may need attention.', {
        component: 'salesAccess',
        operation: 'getUserSales',
        userId: userId.substring(0, 8) + '...',
        count: sales?.length || 0,
        statusFilter,
      })
    }

    return {
      data: filtered,
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
 * Get count of archived sales for a user (within 1-year retention window)
 * Lightweight query that only returns the count, not the data
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to filter by
 * @returns Count of archived sales
 */
export async function getArchivedSalesCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // Calculate 1-year cutoff for archived sales
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0] // YYYY-MM-DD format

  try {
    // Try view first (preferred)
    const { count, error } = await supabase
      .from('sales_v2')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('status', 'archived')
      .or(`archived_at.gte.${oneYearAgoStr},date_end.gte.${oneYearAgoStr}`)

    if (!error && count !== null) {
      return count
    }

    // If error is permissions/column related, fallback to base table
    if (error) {
      const isPermissionError = 
        error.code === 'PGRST301' ||
        error.code === '42501' ||
        error.message?.includes('permission') ||
        error.message?.includes('column') ||
        error.message?.includes('does not exist')

      if (!isPermissionError) {
        // Non-permission error, return 0
        return 0
      }
    }
  } catch (error) {
    // Fall through to base table query
  }

  // Fallback: query base table directly
  try {
    const { getRlsDb, fromBase } = await import('@/lib/supabase/clients')
    const db = await getRlsDb()
    const { count, error } = await fromBase(db, 'sales')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('status', 'archived')
      .or(`archived_at.gte.${oneYearAgoStr},date_end.gte.${oneYearAgoStr}`)

    if (error) {
      return 0
    }

    return count || 0
  } catch (error) {
    return 0
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
    // Read from base table via schema-scoped client
    const { getRlsDb, fromBase } = await import('@/lib/supabase/clients')
    const db = await getRlsDb()
    
    const { data: drafts, error } = await fromBase(db, 'sale_drafts')
      .select('id, draft_key, title, updated_at, payload')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.error('[SALES_ACCESS] Error fetching drafts', error instanceof Error ? error : new Error(String(error)), {
          component: 'salesAccess',
          operation: 'getUserDrafts',
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId: userId.substring(0, 8) + '...',
        })
      }
      return {
        data: [],
        error,
      }
    }

    // Map to DraftListing format, extracting title from payload if not set
    // Compute publishability for each draft
    const { computePublishability } = await import('@/lib/drafts/computePublishability')
    const mappedDrafts: DraftListing[] = (drafts || []).map((draft: any) => {
      const publishability = computePublishability({
        id: draft.id,
        draft_key: draft.draft_key,
        title: draft.title,
        payload: draft.payload || { formData: {}, photos: [], items: [] },
        updated_at: draft.updated_at
      } as DraftRecord)
      return {
        id: draft.id,
        draft_key: draft.draft_key,
        title: draft.title || draft.payload?.formData?.title || null,
        updated_at: draft.updated_at,
        payload: draft.payload || {},
        publishability,
      }
    })

    return {
      data: mappedDrafts,
    }
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.error('[SALES_ACCESS] Unexpected error fetching drafts', error instanceof Error ? error : new Error(String(error)), {
        component: 'salesAccess',
        operation: 'getUserDrafts',
      })
    }
    return {
      data: [],
      error,
    }
  }
}

/**
 * Fetch sale with its items (for sale details page)
 * Reads sale from public.sales_v2 view and items directly from lootaura_v2.items base table
 * Uses RLS-aware client - RLS policies (items_owner_read, items_public_read) handle visibility automatically
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.error('[SALES_ACCESS] Error fetching sale', saleError instanceof Error ? saleError : new Error(String(saleError)), {
          component: 'salesAccess',
          operation: 'getSaleWithItems',
          saleId,
          errorCode: saleError?.code,
        })
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          const { logger } = await import('@/lib/log')
          logger.debug('[SALES_ACCESS] Admin client tags query failed (schema limitation)', {
            component: 'salesAccess',
            operation: 'getSaleWithItems',
            saleId,
            error: tagsRes.error.message,
          })
        }
      }
    } catch (error) {
      // Admin client not available or failed - that's okay, we'll continue without tags
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.debug('[SALES_ACCESS] Could not fetch tags (admin client not available or failed)', {
          component: 'salesAccess',
          operation: 'getSaleWithItems',
          saleId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('[SALES_ACCESS] Tags fetch result', {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        tagsCount: tags.length,
        note: 'Categories will still work from item categories if tags are empty',
      })
    }
    
    const saleWithTags = {
      ...(sale as Sale),
      tags,
    }

    if (!sale.owner_id) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.error('[SALES_ACCESS] Sale found but missing owner_id', new Error('Sale missing owner_id'), {
          component: 'salesAccess',
          operation: 'getSaleWithItems',
          saleId,
        })
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
    // Note: RLS policies work automatically based on Supabase client session context
    // No need to explicitly call getUser() - this was causing blocking delays for anonymous users
    // The client already has session context from cookies, so RLS will work correctly
    
    // Import logger once at the top of the function for all logging
    const { logger } = await import('@/lib/log')
    
    // Load items directly from base table using RLS-aware client
    // RLS policies (items_owner_read and items_public_read) will automatically handle visibility:
    // - Owners see items for their own sales (any status)
    // - Public/anon see items only when sale is published
    const { getRlsDb, fromBase } = await import('@/lib/supabase/clients')
    const db = await getRlsDb()
    
    // Query base table - RLS policies will filter results based on auth context
    // Select image_url and images (if available) - images array is preferred, image_url is fallback
    // Note: Both columns exist in the base table schema (migration 096)
    // The base table is authoritative for items and images - migration 097 backfilled all item images.
    // RLS policy items_public_read uses is_sale_publicly_visible() function (migration 114)
    // to avoid nested RLS issues that previously blocked items for anonymous users.
    const itemsRes = await fromBase(db, 'items')
      .select('id, sale_id, name, price, image_url, images, created_at, category, condition, is_sold')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })
    
    // Log query results (PII-safe) - only in debug mode
    // Note: User context not available without blocking auth lookup, but RLS still works correctly
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      logger.debug('Sale detail items query result', {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        itemsCount: itemsRes.data?.length || 0,
        hasError: !!itemsRes.error,
        errorCode: itemsRes.error?.code || null,
        errorMessage: itemsRes.error?.message || null,
        saleStatus: sale.status,
        ownerId: ownerId ? `${ownerId.substring(0, 8)}...` : null,
        note: 'RLS policies handle visibility automatically based on client session context',
      })
    }
    
    // Log errors but don't fail - return with empty items array
    if (itemsRes.error) {
      logger.error('Error fetching items from base table', itemsRes.error instanceof Error ? itemsRes.error : new Error(String(itemsRes.error)), {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        errorCode: itemsRes.error?.code,
        errorMessage: itemsRes.error?.message,
        errorDetails: itemsRes.error?.details,
        errorHint: itemsRes.error?.hint,
        saleStatus: sale.status,
      })
    }
    
    // Use base table query result - RLS policy should now work correctly
    // after migration 114 fixes the items_public_read policy
    const itemsData = itemsRes.data || []
    // Note: Error logging already handled above, no need to duplicate
    if (itemsData.length > 0 && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      logger.debug('Base table query succeeded', {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        itemsCount: itemsData.length,
      })
    }
    
    const [profileRes, statsRes] = await Promise.all([
      supabase
        .from('profiles_v2')
        .select('id, created_at, display_name, username, avatar_url')
        .eq('id', ownerId)
        .maybeSingle(),
      supabase
        .from('owner_stats')
        .select('user_id, total_sales, last_sale_at, avg_rating, ratings_count')
        .eq('user_id', ownerId)
        .maybeSingle(),
    ])

    // Log errors but don't fail - return with defaults
    if (profileRes.error) {
      logger.error('Error fetching owner profile', profileRes.error instanceof Error ? profileRes.error : new Error(String(profileRes.error)), {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        ownerId,
      })
    }
    if (statsRes.error) {
      logger.error('Error fetching owner stats', statsRes.error instanceof Error ? statsRes.error : new Error(String(statsRes.error)), {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        ownerId,
      })
    }

    // Map items to SaleItem type
    // Base table query returns: id, sale_id, name, price, image_url, images, created_at, category, condition, is_sold
    // Map to SaleItem format expected by components
    // IMPORTANT: Prefer images array over image_url
    const mappedItems: SaleItem[] = (itemsData as any[]).map((item: any) => {
      // Normalize image: prefer images array (like working view path), fallback to image_url
      let photoUrl: string | undefined = undefined
      
      // Try images array first (preferred - matches working view path behavior)
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const firstImage = item.images[0]
        if (typeof firstImage === 'string' && firstImage.trim().length > 0) {
          photoUrl = firstImage.trim()
        }
      }
      // Fallback to image_url (from base table query)
      else if (item.image_url && typeof item.image_url === 'string' && item.image_url.trim().length > 0) {
        photoUrl = item.image_url.trim()
      }
      
      return {
        id: item.id,
        sale_id: item.sale_id,
        name: item.name,
        category: item.category || undefined, // May come from view
        condition: item.condition || undefined, // May come from view
        price: item.price || undefined,
        photo: photoUrl, // Use normalized image as photo
        purchased: item.is_sold || false, // May come from view
        created_at: item.created_at,
      }
    })
    
    // Log final mapped items (only in debug mode)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger: finalLogger } = await import('@/lib/log')
      
      // Log detailed image field information for debugging
      const itemsWithImageData = mappedItems.map(item => ({
        id: item.id,
        name: item.name,
        hasPhoto: !!item.photo,
        photoValue: item.photo ? `${item.photo.substring(0, 50)}...` : null,
        photoLength: item.photo?.length || 0,
      }))
      
      // Also log raw data from the query to see what we're working with
      const rawItemsSample = itemsData && itemsData.length > 0 ? {
        id: itemsData[0].id,
        hasImageUrl: !!itemsData[0].image_url,
        imageUrlValue: itemsData[0].image_url ? `${itemsData[0].image_url.substring(0, 50)}...` : null,
        hasImages: !!itemsData[0].images,
        imagesType: Array.isArray(itemsData[0].images) ? 'array' : typeof itemsData[0].images,
        imagesLength: Array.isArray(itemsData[0].images) ? itemsData[0].images.length : 0,
        imagesFirst: Array.isArray(itemsData[0].images) && itemsData[0].images.length > 0 
          ? `${itemsData[0].images[0].substring(0, 50)}...` 
          : null,
      } : null
      
      finalLogger.debug('Final mapped items for sale detail', {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        rawItemsCount: itemsData?.length || 0,
        mappedItemsCount: mappedItems.length,
        itemsWithPhotos: mappedItems.filter(i => i.photo).length,
        itemsWithoutPhotos: mappedItems.filter(i => !i.photo).length,
        itemsWithImageData,
        rawItemsSample,
        note: 'Check photoValue vs raw image_url/images to identify mapping issues',
      })
    }

    // Normalize owner profile so seller details stay in sync with v2 profile data:
    // - `display_name` (primary public name) is mapped into `full_name` used by UI components.
    const ownerProfileRaw = profileRes.data as
      | { id?: string; created_at?: string | null; display_name?: string | null; username?: string | null; avatar_url?: string | null }
      | null

    const ownerProfile = ownerProfileRaw
      ? {
          id: ownerProfileRaw.id,
          created_at: ownerProfileRaw.created_at,
          full_name: ownerProfileRaw.display_name ?? null,
          username: ownerProfileRaw.username ?? null,
          avatar_url: ownerProfileRaw.avatar_url ?? null,
        }
      : null

    return {
      sale: {
        ...saleWithTags,
        owner_profile: ownerProfile,
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
    const { logger } = await import('@/lib/log')
    logger.error('Unexpected error in getSaleWithItems', error instanceof Error ? error : new Error(String(error)), {
      component: 'salesAccess',
      operation: 'getSaleWithItems',
      saleId,
    })
    return null
  }
}

/**
 * Fetch the nearest published sales to a given sale
 * Uses PostGIS for accurate distance calculation
 * @param supabase - Authenticated Supabase client
 * @param saleId - Sale ID to find neighbors for
 * @param limit - Maximum number of results (default: 2)
 * @returns Array of nearby sales with distance_m field, or empty array on error
 */
export async function getNearestSalesForSale(
  supabase: SupabaseClient,
  saleId: string,
  limit: number = 2
): Promise<Array<Sale & { distance_m: number }>> {
  try {
    // First, fetch the current sale's location
    const { data: currentSale, error: saleError } = await supabase
      .from('sales_v2')
      .select('id, lat, lng')
      .eq('id', saleId)
      .single()

    if (saleError || !currentSale) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.debug('[SALES_ACCESS] Could not fetch current sale for nearest sales', {
          component: 'salesAccess',
          operation: 'getNearestSalesForSale',
          saleId,
          error: saleError?.message,
        })
      }
      return []
    }

    // Validate that the sale has coordinates
    if (
      typeof currentSale.lat !== 'number' ||
      typeof currentSale.lng !== 'number' ||
      isNaN(currentSale.lat) ||
      isNaN(currentSale.lng)
    ) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.debug('[SALES_ACCESS] Current sale has no valid coordinates', {
          component: 'salesAccess',
          operation: 'getNearestSalesForSale',
          saleId,
          lat: currentSale.lat,
          lng: currentSale.lng,
        })
      }
      return []
    }

    // Use PostGIS RPC function to find nearest sales
    // Search within a reasonable radius (50km) to ensure we find results
    const maxDistanceMeters = 50 * 1000 // 50km

    // Try to use the PostGIS RPC function (in lootaura_v2 schema)
    // Use schema-qualified client to access lootaura_v2 functions
    let nearbySales: any[] | null = null
    let rpcError: any = null

    try {
      const { getRlsDb } = await import('@/lib/supabase/clients')
      const rlsDb = await getRlsDb() // This returns a client scoped to lootaura_v2 schema
      const rpcResult = await rlsDb.rpc('get_sales_within_distance', {
        user_lat: currentSale.lat,
        user_lng: currentSale.lng,
        distance_meters: maxDistanceMeters,
        limit_count: limit + 1, // Fetch one extra to account for excluding current sale
      })
      nearbySales = rpcResult?.data ?? null
      rpcError = rpcResult?.error ?? null
    } catch (importError) {
      // If getRlsDb is not available, try with regular supabase client
      // (might work if search_path includes lootaura_v2)
      try {
        const rpcResult = await supabase.rpc('get_sales_within_distance', {
          user_lat: currentSale.lat,
          user_lng: currentSale.lng,
          distance_meters: maxDistanceMeters,
          limit_count: limit + 1,
        })
        nearbySales = rpcResult?.data ?? null
        rpcError = rpcResult?.error ?? null
      } catch (rpcCallError) {
        // If RPC call itself throws, treat as error
        nearbySales = null
        rpcError = rpcCallError instanceof Error ? rpcCallError : new Error('RPC call failed')
      }
    }

    if (rpcError) {
      // If RPC fails, fallback to manual query with Haversine calculation
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.debug('[SALES_ACCESS] PostGIS RPC failed, using fallback query', {
          component: 'salesAccess',
          operation: 'getNearestSalesForSale',
          saleId,
          error: rpcError instanceof Error ? rpcError.message : String(rpcError),
        })
      }

      // Fallback: query all published sales and calculate distance client-side
      const { data: allSales, error: queryError } = await supabase
        .from('sales_v2')
        .select('*')
        .eq('status', 'published')
        .neq('id', saleId)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(100) // Reasonable limit for fallback

      if (queryError || !allSales) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          const { logger } = await import('@/lib/log')
          logger.debug('[SALES_ACCESS] Fallback query failed', {
            component: 'salesAccess',
            operation: 'getNearestSalesForSale',
            saleId,
            error: queryError?.message,
          })
        }
        return []
      }

      // Calculate distances using Haversine formula
      const salesWithDistance = allSales
        .map((sale: any) => {
          const R = 6371000 // Earth's radius in meters
          const dLat = ((sale.lat - currentSale.lat) * Math.PI) / 180
          const dLng = ((sale.lng - currentSale.lng) * Math.PI) / 180
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((currentSale.lat * Math.PI) / 180) *
              Math.cos((sale.lat * Math.PI) / 180) *
              Math.sin(dLng / 2) *
              Math.sin(dLng / 2)
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          const distanceM = R * c

          return {
            ...sale,
            distance_m: Math.round(distanceM),
          }
        })
        .sort((a: any, b: any) => a.distance_m - b.distance_m)
        .slice(0, limit)

      return salesWithDistance as Array<Sale & { distance_m: number }>
    }

    // Filter out the current sale and limit results
    const filtered = (nearbySales || [])
      .filter((sale: any) => sale.id !== saleId)
      .slice(0, limit)
      .map((sale: any) => ({
        ...sale,
        distance_m: sale.distance_meters || 0, // Normalize field name
      }))

    return filtered as Array<Sale & { distance_m: number }>
  } catch (error) {
    // Only log errors in debug mode
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.error('[SALES_ACCESS] Unexpected error in getNearestSalesForSale', error instanceof Error ? error : new Error(String(error)), {
        component: 'salesAccess',
        operation: 'getNearestSalesForSale',
        saleId,
      })
    }
    // Return empty array on error - don't break the page
    return []
  }
}

