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

    // Build query with category filtering if categories are provided
    let query = sb
      .from('sales_v2')
      .select('id, title, description, lat, lng, starts_at, date_start, date_end, time_start, time_end')
      .not('lat', 'is', null)
      .not('lng', 'is', null)

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

    const { data, error } = await query
      .order('id', { ascending: true })
      .limit(Math.min(limit, 1000))

    if (error) {
      const { logger } = await import('@/lib/log')
      logger.error('Markers query error', error instanceof Error ? error : new Error(String(error)), {
        component: 'sales',
        operation: 'markers_query'
      })
      return fail(500, 'QUERY_ERROR', 'Database query failed')
    }

    // Validate date range parameters
    const dateValidation = dateBounds.validateDateRange(startDate, endDate)
    if (!dateValidation.valid) {
      return NextResponse.json({ error: dateValidation.error }, { status: 400 })
    }

    // Parse date bounds using shared helper
    const dateWindow = dateBounds.parseDateBounds(startDate, endDate)
    
    // Debug logging for date filtering (debug mode only to avoid noisy production logs)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      const { logger } = await import('@/lib/log')
      logger.debug('Date filtering', {
        component: 'sales',
        operation: 'markers_date_filter',
        hasDateWindow: !!dateWindow,
        totalRecords: data?.length || 0
      })
    }
    
    // If no date filtering is applied, return all sales
    if (!dateWindow) {
      const markers = data?.map((sale: any) => {
        const R = 6371
        const dLat = (sale.lat - originLat) * Math.PI / 180
        const dLng = (sale.lng - originLng) * Math.PI / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(originLat * Math.PI / 180) * Math.cos(sale.lat * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const distance = R * c

        return {
          id: sale.id,
          title: sale.title,
          description: sale.description,
          lat: sale.lat,
          lng: sale.lng,
          distance: Math.round(distance * 100) / 100
        }
      }) || []

      return NextResponse.json(markers)
    }

    const filtered = (data || [])
      .map((sale: any) => {
        const lat = Number(sale.lat)
        const lng = Number(sale.lng)
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null
        
        // Compute sale start date - use starts_at if available, otherwise compute from date_start + time_start
        let saleStart = null
        if (sale.starts_at) {
          saleStart = new Date(sale.starts_at)
        } else if (sale.date_start) {
          if (sale.time_start) {
            saleStart = new Date(`${sale.date_start}T${sale.time_start}`)
          } else {
            saleStart = new Date(`${sale.date_start}T00:00:00`)
          }
        }
        
        // Compute sale end date - use date_end + time_end, or date_end as end of day
        let saleEnd = null
        if (sale.date_end) {
          if (sale.time_end) {
            saleEnd = new Date(`${sale.date_end}T${sale.time_end}`)
          } else {
            saleEnd = new Date(`${sale.date_end}T23:59:59.999`)
          }
        } else if (saleStart) {
          // If no end date, treat as single-day sale
          saleEnd = new Date(saleStart)
          saleEnd.setHours(23, 59, 59, 999)
        }
        
        return { ...sale, lat, lng, saleStart, saleEnd }
      })
      .filter(Boolean)
      .filter((sale: any) => {
        // Skip date filtering if no date bounds provided
        if (!dateWindow) return true
        
        // Skip sales with no date information
        if (!sale.saleStart && !sale.saleEnd) {
          return false
        }
        
        const overlaps = dateBounds.checkDateOverlap(sale.saleStart, sale.saleEnd, dateWindow)
        return overlaps
      })
      .map((sale: any) => {
        const R = 6371
        const dLat = (sale.lat - originLat) * Math.PI / 180
        const dLng = (sale.lng - originLng) * Math.PI / 180
        const a = Math.sin(dLat/2) ** 2 + Math.cos(originLat * Math.PI/180) * Math.cos(sale.lat * Math.PI/180) * Math.sin(dLng/2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        const distanceKm = R * c
        return { ...sale, distanceKm }
      })
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


