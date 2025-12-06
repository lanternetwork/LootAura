import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ok, fail } from '@/lib/http/json'
import { resolveDatePreset } from '@/lib/shared/resolveDatePreset'
import { normalizeCategories } from '@/lib/shared/categoryNormalizer'
import { toDbSet } from '@/lib/shared/categoryContract'
import { validateDateRange } from '@/lib/shared/dateBounds'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'

/**
 * Lightweight endpoint to get sales count only (no data)
 * Used for hero page stats display to improve performance
 */
async function countHandler(request: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // Parse location
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const zip = searchParams.get('zip')
    
    let latitude: number | undefined
    let longitude: number | undefined
    let distanceKm = 50 // Default
    
    // Resolve ZIP to lat/lng if needed
    if (zip && !lat && !lng) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        const geoRes = await fetch(`${baseUrl}/api/geocoding/zip?zip=${encodeURIComponent(zip)}`)
        const geoData = await geoRes.json()
        
        if (geoData.ok && geoData.lat && geoData.lng) {
          latitude = parseFloat(geoData.lat)
          longitude = parseFloat(geoData.lng)
        } else {
          return ok({ count: 0, durationMs: Date.now() - startedAt })
        }
      } catch (error) {
        const { logger } = await import('@/lib/log')
        logger.error('Failed to resolve zip code', error instanceof Error ? error : new Error(String(error)), {
          component: 'sales',
          operation: 'count_zip_resolve',
          zip
        })
        return ok({ count: 0, durationMs: Date.now() - startedAt })
      }
    } else if (lat && lng) {
      latitude = parseFloat(lat)
      longitude = parseFloat(lng)
    } else {
      return fail(400, 'LOCATION_REQUIRED', 'lat/lng or zip parameter required')
    }
    
    // Parse distance
    const radiusKm = searchParams.get('radiusKm')
    if (radiusKm) {
      distanceKm = Math.max(1, Math.min(parseFloat(radiusKm), 160))
    }
    
    // Parse date range
    const dateRange = searchParams.get('dateRange') || 'any'
    const startDate = searchParams.get('from') || searchParams.get('dateFrom') || undefined
    const endDate = searchParams.get('to') || searchParams.get('dateTo') || undefined
    
    // Validate date range
    const dateValidation = validateDateRange(startDate, endDate)
    if (!dateValidation.valid) {
      return fail(400, 'INVALID_DATE_RANGE', dateValidation.error || 'Invalid date range')
    }
    
    // Convert date range to start/end dates
    let startDateParam: string | null = null
    let endDateParam: string | null = null
    
    if (startDate) startDateParam = startDate
    if (endDate) endDateParam = endDate
    
    if (!startDateParam && !endDateParam && dateRange !== 'any') {
      const resolved = resolveDatePreset(dateRange as any, new Date())
      if (resolved) {
        startDateParam = resolved.from || null
        endDateParam = resolved.to || null
      }
    }
    
    // Parse categories (optional - for future use)
    const categoriesParam = searchParams.get('categories') || searchParams.get('cat') || undefined
    const categories = normalizeCategories(categoriesParam)
    const dbCategories = toDbSet(categories)
    
    // Validate location
    if (latitude === undefined || longitude === undefined) {
      return fail(400, 'INVALID_LOCATION', 'Invalid location: latitude or longitude not set')
    }
    
    // Calculate bounding box
    const latRange = distanceKm / 111.0 // 1 degree ≈ 111km
    const lngRange = distanceKm / (111.0 * Math.cos(latitude * Math.PI / 180))
    
    const minLat = latitude - latRange
    const maxLat = latitude + latRange
    const minLng = longitude - lngRange
    const maxLng = longitude + lngRange
    
    // Build count query
    let query = supabase
      .from('sales_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('lat', minLat)
      .lte('lat', maxLat)
      .gte('lng', minLng)
      .lte('lng', maxLng)
    
    // Apply date filters
    if (startDateParam) {
      query = query.gte('date_start', startDateParam)
    }
    if (endDateParam) {
      query = query.lte('date_start', endDateParam)
    }
    
    // Apply category filters if specified (using items subquery approach like main sales route)
    let finalCount = 0
    if (dbCategories.length > 0) {
      // Use subquery approach to find sales with matching category items
      const { data: salesWithCategories, error: categoryError } = await supabase
        .from('items_v2')
        .select('sale_id')
        .in('category', dbCategories)
      
          if (categoryError) {
            const { logger } = await import('@/lib/log')
            logger.error('Category filter error in count', categoryError instanceof Error ? categoryError : new Error(String(categoryError)), {
              component: 'sales',
              operation: 'count_category_filter'
            })
            return fail(500, 'CATEGORY_FILTER_ERROR', 'Failed to filter by categories')
          }
      
      const saleIds = [...new Set(salesWithCategories?.map(item => item.sale_id) || [])]
      
      if (saleIds.length > 0) {
        // Count sales that match location/date AND have matching category items
            const { count, error } = await query.in('id', saleIds)

            if (error) {
              const { logger } = await import('@/lib/log')
              logger.error('Query error in count', error instanceof Error ? error : new Error(String(error)), {
                component: 'sales',
                operation: 'count_query',
                hasCategoryFilter: true
              })
              return fail(500, 'QUERY_ERROR', 'Failed to count sales')
            }
        
        finalCount = count || 0
      }
    } else {
      // No category filter - simple count
      const { count, error } = await query
      
       if (error) {
         const { logger } = await import('@/lib/log')
         logger.error('Query error in count', error instanceof Error ? error : new Error(String(error)), {
           component: 'sales',
           operation: 'count_query',
           hasCategoryFilter: false
         })
         return fail(500, 'QUERY_ERROR', 'Failed to count sales')
       }
      
      finalCount = count || 0
    }
    
    // Add cache headers for public count data
    const { addCacheHeaders } = await import('@/lib/http/cache')
    const response = ok({
      count: finalCount,
      durationMs: Date.now() - startedAt
    })
    return addCacheHeaders(response, {
      maxAge: 30, // 30 seconds client cache
      sMaxAge: 60, // 1 minute CDN cache (counts change more frequently)
      staleWhileRevalidate: 30,
      public: true
    })
    
  } catch (error) {
    const { logger } = await import('@/lib/log')
    logger.error('Unexpected error in count', error instanceof Error ? error : new Error(String(error)), {
      component: 'sales',
      operation: 'count',
      durationMs: Date.now() - startedAt
    })
    return fail(500, 'INTERNAL_ERROR', 'Internal server error')
  }
}

export const GET = withRateLimit(countHandler, [
  Policies.SALES_VIEW_30S,
  Policies.SALES_VIEW_HOURLY
])

