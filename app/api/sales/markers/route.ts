/* eslint-disable no-undef */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import * as dateBounds from '@/lib/shared/dateBounds'
import { normalizeCategories } from '@/lib/shared/categoryNormalizer'
import { toDbSet } from '@/lib/shared/categoryContract'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { fail } from '@/lib/http/json'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// Markers API with server-side date, distance, and category filtering
// Response shape expected by SalesMap: plain array
// [{ id: string, title: string, lat: number, lng: number }]
async function markersHandler(request: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const url = new URL(request.url)
    const q = url.searchParams
    const latParam = q.get('lat')
    const lngParam = q.get('lng')
    const distanceParam = q.get('distanceKm')
    const startDate = q.get('from') || q.get('dateFrom') || q.get('startDate') || undefined
    const endDate = q.get('to') || q.get('dateTo') || q.get('endDate') || undefined
    
    const limitParam = q.get('limit')
    // Accept both canonical 'categories' and legacy 'cat' parameters
    const catsParam = q.get('categories') || q.get('cat') || q.get('cats') || undefined

    // Validate lat/lng
    const originLat = latParam !== null ? parseFloat(latParam) : NaN
    const originLng = lngParam !== null ? parseFloat(lngParam) : NaN
    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      return NextResponse.json({ error: 'Missing or invalid lat/lng' }, { status: 400 })
    }
    // Normalize distance (km)
    const distanceKm = Number.isFinite(parseFloat(String(distanceParam))) ? Math.max(0, parseFloat(String(distanceParam))) : 40
    const limit = Number.isFinite(parseFloat(String(limitParam))) ? Math.min(parseInt(String(limitParam), 10), 1000) : 1000
    // Canonical parameter parsing - normalize to sorted, deduplicated array
    const categories = normalizeCategories(catsParam)
    // Treat empty result as undefined (no category filter)
    const catsCsv = categories.length > 0 ? categories.join(',') : ''
    
    // Map UI categories to DB tokens exactly like list endpoint
    const dbCategories = toDbSet(categories)

    // Debug server-side category processing
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('Category processing', {
        component: 'sales',
        operation: 'markers_category_parse',
        categoriesReceived: catsParam,
        categoriesNormalized: catsCsv
      })
    }

    const sb = createSupabaseServerClient()
    
    // Validate and parse date range parameters early (before query)
    const dateValidation = dateBounds.validateDateRange(startDate, endDate)
    if (!dateValidation.valid) {
      return NextResponse.json({ error: dateValidation.error }, { status: 400 })
    }
    
    // Parse date bounds using shared helper
    const dateWindow = dateBounds.parseDateBounds(startDate, endDate)
    const now = new Date()
    
    // Parse favorites-only filter
    const favoritesOnly = q.get('favoritesOnly') === '1' || q.get('favorites') === '1'
    
    // If favorites-only is requested, require authentication
    let favoriteSaleIds: string[] | null = null
    if (favoritesOnly) {
      const { data: { user }, error: authError } = await sb.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Authentication required for favorites-only filter' }, { status: 401 })
      }
      
      // Fetch user's favorite sale IDs
      const { data: favorites, error: favoritesError } = await sb
        .from('favorites_v2')
        .select('sale_id')
        .eq('user_id', user.id)
      
      if (favoritesError) {
        return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
      }
      
      favoriteSaleIds = favorites?.map(f => f.sale_id) || []
      
      // If user has no favorites, return empty results
      if (favoriteSaleIds.length === 0) {
        return NextResponse.json([])
      }
    }

    // Build query with category filtering if categories are provided
    // Try with moderation_status filter first, retry without if column doesn't exist
    let query = sb
      .from('sales_v2')
      .select('id, title, description, lat, lng, starts_at, date_start, date_end, time_start, time_end, status, archived_at')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .in('status', ['published', 'active'])
      .is('archived_at', null)
    
    // Apply date filtering in database WHERE clause
    // Logic matches client-side filtering: future-only when no dateWindow, overlap when dateWindow exists
    // Note: Using date columns only (date_start, date_end) for filtering; time precision handled client-side if needed
    if (!dateWindow) {
      // Future-only: exclude sales that have ended (end_date < today)
      // If date_end exists, check if it's >= today
      // If no date_end, include the sale (treat as ongoing)
      const todayStr = now.toISOString().split('T')[0] // YYYY-MM-DD format
      // PostgREST OR syntax: comma-separated conditions
      query = query.or(`date_end.is.null,date_end.gte.${todayStr}`)
    } else {
      // Date window overlap: sale overlaps window if saleStart <= windowEnd AND saleEnd >= windowStart
      // Exclude sales with no date information when window is set
      const windowStartStr = dateWindow.start.toISOString().split('T')[0]
      const windowEndStr = dateWindow.end.toISOString().split('T')[0]
      
      // Require at least one date field (exclude sales with no date info)
      query = query.or('date_start.not.is.null,date_end.not.is.null')
      
      // Overlap condition: (date_end >= windowStart OR date_start >= windowStart) AND (date_start <= windowEnd OR date_end <= windowEnd)
      // Using date columns only; this approximates the timestamp-based overlap logic
      // First condition: saleEnd >= windowStart (use date_end, fallback to date_start)
      query = query.or(`date_end.gte.${windowStartStr},date_start.gte.${windowStartStr}`)
      // Second condition: saleStart <= windowEnd (use date_start, fallback to date_end)
      query = query.or(`date_start.lte.${windowEndStr},date_end.lte.${windowEndStr}`)
    }
    
    // Try to add moderation_status filter (may fail if migrations not run)
    let useModerationFilter = true
    try {
      query = query.neq('moderation_status', 'hidden_by_admin')
    } catch (e) {
      useModerationFilter = false
    }
    
    // Apply favorites-only filter if requested
    if (favoritesOnly && favoriteSaleIds && favoriteSaleIds.length > 0) {
      query = query.in('id', favoriteSaleIds)
    }

    // Apply category filtering by joining with items table
    if (Array.isArray(categories) && categories.length > 0) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.debug('Applying category filter', {
          component: 'sales',
          operation: 'markers_category_filter',
          categoriesCount: categories.length,
          dbCategoriesCount: dbCategories.length
        })
      }
      
      // Use a subquery approach to find sales that have items matching the categories
      // Since category is a computed text column, use exact matching
      const { data: salesWithCategories, error: categoryError } = await sb
        .from('items_v2')
        .select('sale_id')
        .in('category', dbCategories)
      
      if (categoryError) {
        const { logger } = await import('@/lib/log')
        logger.error('Category filter error', categoryError instanceof Error ? categoryError : new Error(String(categoryError)), {
          component: 'sales',
          operation: 'markers_category_filter'
        })
        return fail(500, 'CATEGORY_FILTER_ERROR', 'Category filter failed')
      }
      
      const saleIds = salesWithCategories?.map(item => item.sale_id) || []
      
      // Debug server-side category filtering results
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        const { logger } = await import('@/lib/log')
        logger.debug('Category filter results', {
          component: 'sales',
          operation: 'markers_category_filter',
          matchingSalesCount: saleIds.length
        })
      }
      
      if (saleIds.length > 0) {
        query = query.in('id', saleIds)
      } else {
        // No sales match the categories, return empty result
        return NextResponse.json({
          ok: true,
          data: [],
          center: { lat: originLat, lng: originLng },
          distanceKm,
          count: 0,
          durationMs: Date.now() - startedAt
        })
      }
    }

    let { data, error } = await query
      .order('id', { ascending: true })
      .limit(Math.min(limit, 1000))

    // If query failed due to missing moderation_status column, retry without it
    if (error && useModerationFilter && (
      String(error).includes('moderation_status') ||
      String(error).includes('column') ||
      (error as any)?.code === 'PGRST204' ||
      (error as any)?.message?.includes('moderation_status')
    )) {
      const { logger } = await import('@/lib/log')
      logger.warn('moderation_status column not found, retrying without filter', {
        component: 'sales',
        operation: 'markers',
        error: String(error)
      })
      
      // Rebuild query without moderation_status filter (include date filters)
      query = sb
        .from('sales_v2')
        .select('id, title, description, lat, lng, starts_at, date_start, date_end, time_start, time_end, status, archived_at')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .in('status', ['published', 'active'])
        .is('archived_at', null)
      
      // Re-apply date filters
      if (!dateWindow) {
        const todayStr = now.toISOString().split('T')[0]
        query = query.or(`date_end.is.null,date_end.gte.${todayStr}`)
      } else {
        const windowStartStr = dateWindow.start.toISOString().split('T')[0]
        const windowEndStr = dateWindow.end.toISOString().split('T')[0]
        query = query.or('date_start.not.is.null,date_end.not.is.null')
        query = query.or(`date_end.gte.${windowStartStr},date_start.gte.${windowStartStr}`)
        query = query.or(`date_start.lte.${windowEndStr},date_end.lte.${windowEndStr}`)
      }
      
      if (favoritesOnly && favoriteSaleIds && favoriteSaleIds.length > 0) {
        query = query.in('id', favoriteSaleIds)
      }
      
      if (Array.isArray(categories) && categories.length > 0) {
        const { data: salesWithCategories } = await sb
          .from('items_v2')
          .select('sale_id')
          .in('category', dbCategories)
        const saleIds = salesWithCategories?.map(item => item.sale_id) || []
        if (saleIds.length > 0) {
          query = query.in('id', saleIds)
        } else {
          return NextResponse.json({
            ok: true,
            data: [],
            center: { lat: originLat, lng: originLng },
            distanceKm,
            count: 0,
            durationMs: Date.now() - startedAt
          })
        }
      }
      
      const retryResult = await query
        .order('id', { ascending: true })
        .limit(Math.min(limit, 1000))
      
      data = retryResult.data
      error = retryResult.error
    }

    if (error) {
      const { logger } = await import('@/lib/log')
      logger.error('Markers query error', error instanceof Error ? error : new Error(String(error)), {
        component: 'sales',
        operation: 'markers_query'
      })
      return fail(500, 'QUERY_ERROR', 'Database query failed')
    }

    // Debug logging (date filtering now done in DB)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('Markers query completed (date filtering in DB)', {
        component: 'sales',
        operation: 'markers_query',
        totalRecords: data?.length || 0,
        hasDateWindow: !!dateWindow
      })
    }
    
    // Apply distance filtering and mapping (date filtering already done in DB)
    const filtered = (data || [])
      .map((sale: any) => {
        const lat = Number(sale.lat)
        const lng = Number(sale.lng)
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null
        
        // Calculate distance (Haversine formula)
        const R = 6371 // Earth's radius in km
        const dLat = (lat - originLat) * Math.PI / 180
        const dLng = (lng - originLng) * Math.PI / 180
        const a = Math.sin(dLat/2) ** 2 + Math.cos(originLat * Math.PI/180) * Math.cos(lat * Math.PI/180) * Math.sin(dLng/2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        const distanceKm = R * c
        
        return { ...sale, lat, lng, distanceKm }
      })
      .filter(Boolean)
      .filter((sale: any) => sale.distanceKm <= distanceKm)

    const markers = filtered
      .slice(0, Math.min(limit, 1000))
      .map((sale: any) => ({ id: sale.id, title: sale.title, lat: sale.lat, lng: sale.lng }))

    // Debug logging for final results
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('Markers query completed', {
        component: 'sales',
        operation: 'markers_query',
        totalRecords: data?.length || 0,
        afterDateFilter: filtered.length,
        finalMarkers: markers.length
      })
    }

    // Return structured response matching /api/sales format
    return NextResponse.json({
      ok: true,
      data: markers,
      center: { lat: originLat, lng: originLng },
      distanceKm,
      count: markers.length,
      durationMs: Date.now() - startedAt
    }, {
      headers: {
        'Cache-Control': 'public, max-age=120, s-maxage=600', // 2 min client, 10 min CDN
        'CDN-Cache-Control': 'public, max-age=600',
        'Vary': 'Accept-Encoding'
      }
    })
  } catch (error: any) {
    const { logger } = await import('@/lib/log')
    logger.error('Markers API error', error instanceof Error ? error : new Error(String(error)), {
      component: 'sales',
      operation: 'markers_handler',
      durationMs: Date.now() - startedAt
    })
    return fail(500, 'INTERNAL_ERROR', 'Internal server error')
  }
}

export const GET = withRateLimit(markersHandler, [
  Policies.SALES_VIEW_30S,
  Policies.SALES_VIEW_HOURLY
])


