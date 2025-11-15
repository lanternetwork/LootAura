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
        const { isProduction } = await import('@/lib/env')
        if (!isProduction()) {
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

    const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
    const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
    // Read from base table via schema-scoped client
    const { getRlsDb, fromBase } = await import('@/lib/supabase/clients')
    const db = getRlsDb()
    
    const { data: drafts, error } = await fromBase(db, 'sale_drafts')
      .select('id, draft_key, title, updated_at, payload')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
    const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
    // Note: updated_at doesn't exist in the view, only created_at
    const { data: items, error } = await supabase
      .from('items_v2')
      .select('id, sale_id, name, category, price, images, image_url, created_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
        console.error('[SALES_ACCESS] Error fetching items for sale:', error)
      }
      return []
    }
    
    const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
      const { isProduction } = await import('@/lib/env')
      if (!isProduction() && item.image_url && (!item.images || !Array.isArray(item.images) || item.images.length === 0)) {
        console.log('[SALES_ACCESS] Item image fallback (image_url → images[]):', {
          itemId: item.id,
          itemName: item.name,
          hadImageUrl: !!item.image_url,
          hadImages: !!item.images,
          imagesCount: images.length,
        })
      }
      
      // Log dev-only when item has neither images nor image_url
      const { isProduction } = await import('@/lib/env')
      if (!isProduction() && images.length === 0) {
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
    const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
      const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SALES_ACCESS] Admin client tags query failed (schema limitation):', {
            saleId,
            error: tagsRes.error.message,
          })
        }
      }
    } catch (error) {
      // Admin client not available or failed - that's okay, we'll continue without tags
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[SALES_ACCESS] Could not fetch tags (admin client not available or failed):', {
          saleId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SALES_ACCESS] Tags fetch result:', {
        saleId,
        tagsCount: tags.length,
        tags,
        note: 'Categories will still work from item categories if tags are empty',
      })
    }
    
    const saleWithTags = {
      ...(sale as Sale),
      tags,
    }

    if (!sale.owner_id) {
      const { isProduction } = await import('@/lib/env')
    if (!isProduction()) {
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
    // Try to fetch items with images column first, fallback if column doesn't exist
    let itemsRes: any
    try {
      itemsRes = await supabase
        .from('items_v2')
        .select('id, sale_id, name, category, price, image_url, images, created_at')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false })
      
      // If error is about missing images column, retry without it
      if (itemsRes.error && 
          (itemsRes.error.message?.includes('column') && itemsRes.error.message?.includes('images')) ||
          itemsRes.error?.code === 'PGRST301') {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SALES_ACCESS] images column not found, falling back to image_url only')
        }
        itemsRes = await supabase
          .from('items_v2')
          .select('id, sale_id, name, category, price, image_url, created_at')
          .eq('sale_id', saleId)
          .order('created_at', { ascending: false })
      }
      
      // If error is about missing updated_at column, retry without it
      if (itemsRes.error && 
          (itemsRes.error.message?.includes('column') && itemsRes.error.message?.includes('updated_at')) ||
          itemsRes.error?.code === '42703') {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SALES_ACCESS] updated_at column not found, retrying without it')
        }
        itemsRes = await supabase
          .from('items_v2')
          .select('id, sale_id, name, category, price, image_url, created_at')
          .eq('sale_id', saleId)
          .order('created_at', { ascending: false })
      }
    } catch (err) {
      // If there's an exception, create a mock error response
      // Ensure error is an object with code and message properties
      itemsRes = { 
        data: null, 
        error: err instanceof Error ? {
          code: (err as any).code || 'UNKNOWN',
          message: err.message || 'Unknown error',
        } : {
          code: 'UNKNOWN',
          message: String(err) || 'Unknown error',
        }
      }
    }
    
    const [profileRes, statsRes] = await Promise.all([
      supabase
        .from('profiles_v2')
        .select('id, created_at, full_name, username, avatar_url')
        .eq('id', ownerId)
        .maybeSingle(),
      supabase
        .from('owner_stats')
        .select('user_id, total_sales, last_sale_at, avg_rating, ratings_count')
        .eq('user_id', ownerId)
        .maybeSingle(),
    ])

    // Log errors but don't fail - return with defaults
    const { logger } = await import('@/lib/log')
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
    if (itemsRes.error) {
      // Always log errors since this is critical
      logger.error('Error fetching items', itemsRes.error instanceof Error ? itemsRes.error : new Error(String(itemsRes.error)), {
        component: 'salesAccess',
        operation: 'getSaleWithItems',
        saleId,
        errorCode: itemsRes.error?.code,
      })
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SALES_ACCESS] Items fetch result:', {
        saleId,
        hasError: !!itemsRes.error,
        itemsResError: itemsRes.error ? {
          code: itemsRes.error?.code || 'unknown',
          message: itemsRes.error?.message || 'unknown error',
          errorType: itemsRes.error?.constructor?.name || typeof itemsRes.error,
        } : null,
        itemsCount: itemsRes.data?.length || 0,
        items: itemsRes.data?.map((i: any) => ({ id: i.id, name: i.name, category: i.category })), // Log summary only
        // Debug: Check if sale status might be blocking items
        saleStatus: sale.status,
        saleIdMatch: sale.id === saleId,
      })
    }
    
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
          
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[SALES_ACCESS] Admin client items check (bypasses RLS):', {
              saleId,
              adminItemsCount: adminItems?.length || 0,
              adminItemsError: adminItemsRes.error ? {
                code: adminItemsRes.error?.code || 'unknown',
                message: adminItemsRes.error?.message || 'unknown error',
              } : null,
              adminItems: adminItems?.map(i => ({ id: i.id, name: i.name, category: i.category })),
              note: 'If admin finds items but regular query returns 0, there may be an RLS issue',
            })
          }
        }
      } catch (error) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SALES_ACCESS] Could not check items via admin client:', {
            saleId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    // Map items to SaleItem type
    // Normalize images: prefer images array, fallback to image_url
    const mappedItems: SaleItem[] = ((itemsRes.data || []) as any[]).map((item: any) => {
      // Normalize images: prefer images array, fallback to image_url
      const images: string[] = Array.isArray(item.images) && item.images.length > 0
        ? item.images.filter((url: any): url is string => typeof url === 'string')
        : (item.image_url ? [item.image_url] : [])
      
      // Log dev-only fallback when using image_url
      const { isProduction } = await import('@/lib/env')
      if (!isProduction() && item.image_url && (!item.images || !Array.isArray(item.images) || item.images.length === 0)) {
        console.log('[SALES_ACCESS] Item image fallback (image_url → images[]):', {
          itemId: item.id,
          itemName: item.name,
          hadImageUrl: !!item.image_url,
          hadImages: !!item.images,
          imagesCount: images.length,
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
        console.log('[SALES_ACCESS] Could not fetch current sale for nearest sales:', {
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
        console.log('[SALES_ACCESS] Current sale has no valid coordinates:', {
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
      const rlsDb = getRlsDb() // This returns a client scoped to lootaura_v2 schema
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
        console.log('[SALES_ACCESS] PostGIS RPC failed, using fallback query:', {
          saleId,
          error: rpcError.message,
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
          console.log('[SALES_ACCESS] Fallback query failed:', {
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
    // Only log errors in debug mode and not in test environment
    if (process.env.NEXT_PUBLIC_DEBUG === 'true' && process.env.NODE_ENV !== 'test') {
      console.error('[SALES_ACCESS] Unexpected error in getNearestSalesForSale:', error)
    }
    // Return empty array on error - don't break the page
    return []
  }
}

