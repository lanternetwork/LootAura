/* eslint-disable no-undef */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Sale, PublicSale } from '@/lib/types'
import * as dateBounds from '@/lib/shared/dateBounds'
import { normalizeCategories } from '@/lib/shared/categoryNormalizer'
import { toDbSet } from '@/lib/shared/categoryContract'
import { z } from 'zod'

// CRITICAL: This API MUST require lat/lng - never remove this validation
// See docs/AI_ASSISTANT_RULES.md for full guidelines
export const dynamic = 'force-dynamic'

// Bbox validation schema
const bboxSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180)
}).refine((data) => data.north > data.south, {
  message: "north must be greater than south",
  path: ["north"]
}).refine((data) => data.east > data.west, {
  message: "east must be greater than west", 
  path: ["east"]
})

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // 1. Parse & validate location (either lat/lng or bbox)
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const north = searchParams.get('north')
    const south = searchParams.get('south')
    const east = searchParams.get('east')
    const west = searchParams.get('west')
    
    let latitude: number
    let longitude: number
    let distanceKm: number | undefined
    let actualBbox: any = null
    
    // Check if bbox parameters are provided
    if (north && south && east && west) {
      try {
        const bboxData = {
          north: parseFloat(north),
          south: parseFloat(south),
          east: parseFloat(east),
          west: parseFloat(west)
        }
        
        const validatedBbox = bboxSchema.parse(bboxData)
        console.log(`[API_SALES] bbox=${validatedBbox.north},${validatedBbox.south},${validatedBbox.east},${validatedBbox.west}`)
        console.log(`[API_SALES] bbox range: lat=${validatedBbox.north - validatedBbox.south}, lng=${validatedBbox.east - validatedBbox.west}`)
        console.log(`[API_SALES] bbox center: lat=${(validatedBbox.north + validatedBbox.south) / 2}, lng=${(validatedBbox.east + validatedBbox.west) / 2}`)
        
        // Calculate center and approximate distance from bbox
        latitude = (validatedBbox.north + validatedBbox.south) / 2
        longitude = (validatedBbox.east + validatedBbox.west) / 2
        
        // When using viewport bounds, don't calculate distance - we'll use bbox filtering instead
        // Set distanceKm to a very large value to effectively disable distance filtering
        distanceKm = 1000 // 1000km - effectively unlimited
        
        // Store the actual bbox for proper filtering
        actualBbox = validatedBbox
        
      } catch (error: any) {
        console.log(`[SALES] Invalid bbox: ${error.message}`)
        return NextResponse.json({ 
          ok: false, 
          error: `Invalid bbox: ${error.message}` 
        }, { status: 400 })
      }
    } else if (lat && lng) {
      // Legacy lat/lng support
      latitude = parseFloat(lat)
      longitude = parseFloat(lng)
      
      if (isNaN(latitude) || isNaN(longitude)) {
        console.log(`[SALES] Invalid location: lat=${lat}, lng=${lng}`)
        return NextResponse.json({ 
          ok: false, 
          error: 'Invalid location coordinates' 
        }, { status: 400 })
      }
    } else {
      console.log(`[SALES] Missing location: lat=${lat}, lng=${lng}, bbox=${north},${south},${east},${west}`)
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing location (provide either lat/lng or north/south/east/west)' 
      }, { status: 400 })
    }
    
    // 2. Parse & validate other parameters
    if (distanceKm === undefined) {
      distanceKm = Math.max(1, Math.min(
        searchParams.get('distanceKm') ? parseFloat(searchParams.get('distanceKm') || '40') : 40,
        160
      ))
    }
    
    const dateRange = searchParams.get('dateRange') || 'any'
    const startDate = searchParams.get('from') || searchParams.get('dateFrom') || searchParams.get('startDate') || undefined
    const endDate = searchParams.get('to') || searchParams.get('dateTo') || searchParams.get('endDate') || undefined
    
    
    // Accept both canonical 'categories' and legacy 'cat' parameters
    const categoriesParam = searchParams.get('categories') || searchParams.get('cat') || undefined
    // Canonical parameter parsing - normalize to sorted, deduplicated array
    const categories = normalizeCategories(categoriesParam)
    
    // Apply UI→DB mapping
    const dbCategories = toDbSet(categories)
    
    // Debug server-side category processing
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[FILTER DEBUG] Server received categories:', categories)
      console.log('[FILTER DEBUG] categoriesParam =', categoriesParam)
      console.log('[FILTER DEBUG] normalized categories:', categories)
      console.log('[FILTER DEBUG] db mapped categories:', dbCategories)
      console.log('[FILTER DEBUG] categories param source:', searchParams.get('categories') ? 'categories' : searchParams.get('cat') ? 'cat (legacy)' : 'none')
      console.log('[FILTER DEBUG] relationUsed = public.items_v2')
      console.log('[FILTER DEBUG] predicateChosen = = ANY')
    }
    
    const q = searchParams.get('q')
    if (q && q.length > 64) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Search query too long' 
      }, { status: 400 })
    }
    
    const limit = Math.min(searchParams.get('limit') ? parseInt(searchParams.get('limit') || '24') : 24, 200)
    const offset = Math.max(searchParams.get('offset') ? parseInt(searchParams.get('offset') || '0') : 0, 0)
    
    // Validate date range parameters
    const dateValidation = dateBounds.validateDateRange(startDate, endDate)
    if (!dateValidation.valid) {
      return NextResponse.json({ 
        ok: false, 
        error: dateValidation.error 
      }, { status: 400 })
    }

    // Convert date range to start/end dates
    let startDateParam: string | null = null
    let endDateParam: string | null = null
    
    // If explicit start/end provided, honor them regardless of dateRange token
    if (startDate) startDateParam = startDate
    if (endDate) endDateParam = endDate
    
    // If no explicit dates, compute from dateRange presets
    if (!startDateParam && !endDateParam && dateRange !== 'any') {
      const now = new Date()
      switch (dateRange) {
        case 'today': {
          startDateParam = now.toISOString().split('T')[0]
          endDateParam = now.toISOString().split('T')[0]
          break
        }
        case 'weekend': {
          const saturday = new Date(now)
          saturday.setDate(now.getDate() + (6 - now.getDay()))
          const sunday = new Date(saturday)
          sunday.setDate(saturday.getDate() + 1)
          startDateParam = saturday.toISOString().split('T')[0]
          endDateParam = sunday.toISOString().split('T')[0]
          break
        }
        case 'next_weekend': {
          const nextSaturday = new Date(now)
          nextSaturday.setDate(now.getDate() + (6 - now.getDay()) + 7)
          const nextSunday = new Date(nextSaturday)
          nextSunday.setDate(nextSaturday.getDate() + 1)
          startDateParam = nextSaturday.toISOString().split('T')[0]
          endDateParam = nextSunday.toISOString().split('T')[0]
          break
        }
      }
    }
    
    console.log(`[SALES] Query params: lat=${latitude}, lng=${longitude}, km=${distanceKm}, start=${startDateParam}, end=${endDateParam}, categories=[${categories.join(',')}], q=${q}, limit=${limit}, offset=${offset}`)
    
    let results: PublicSale[] = []
    let degraded = false
    let totalSalesCount = 0
    
    // 3. Use direct query to sales_v2 view (RPC functions have permission issues)
    try {
      console.log(`[SALES] Querying sales_v2 view directly...`)
      
      // First, let's check the total count of sales in the database
      const { count: totalCount, error: _countError } = await supabase
        .from('sales_v2')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
      
      totalSalesCount = totalCount || 0
      console.log(`[SALES] Total published sales in database:`, totalSalesCount)
      
      // Use actual bbox if provided, otherwise calculate from distance
      let minLat, maxLat, minLng, maxLng
      
      if (actualBbox) {
        // Expand the viewport bounds by 50% to ensure we capture nearby sales
        const latBuffer = (actualBbox.north - actualBbox.south) * 0.5
        const lngBuffer = (actualBbox.east - actualBbox.west) * 0.5
        
        minLat = actualBbox.south - latBuffer
        maxLat = actualBbox.north + latBuffer
        minLng = actualBbox.west - lngBuffer
        maxLng = actualBbox.east + lngBuffer
        
        console.log(`[SALES] Using expanded viewport bbox: lat=${minLat} to ${maxLat}, lng=${minLng} to ${maxLng}`)
        console.log(`[SALES] Original bbox: lat=${actualBbox.south} to ${actualBbox.north}, lng=${actualBbox.west} to ${actualBbox.east}`)
        console.log(`[SALES] Expansion: latBuffer=${latBuffer}, lngBuffer=${lngBuffer}`)
      } else {
        // Calculate bounding box for approximate distance filtering
        const latRange = distanceKm / 111.0 // 1 degree ≈ 111km
        const lngRange = distanceKm / (111.0 * Math.cos(latitude * Math.PI / 180))
        
        minLat = latitude - latRange
        maxLat = latitude + latRange
        minLng = longitude - lngRange
        maxLng = longitude + lngRange
        
        console.log(`[SALES] Calculated bbox: lat=${minLat} to ${maxLat}, lng=${minLng} to ${maxLng}`)
      }
      
      let query = supabase
        .from('sales_v2')
        .select('*')
        .gte('lat', minLat)
        .lte('lat', maxLat)
        .gte('lng', minLng)
        .lte('lng', maxLng)
      
      // NOTE: We filter by date window after fetching to avoid PostgREST OR-composition issues
      
      // Add category filters by joining with items table
      if (categories.length > 0) {
        console.log('[SALES] Applying category filter:', categories)
        
        // Debug: Check if items_v2 table has category column
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[FILTER DEBUG] Checking items_v2 table structure...')
          const { data: tableInfo, error: tableError } = await supabase
            .from('items_v2')
            .select('*')
            .limit(1)
          
          if (tableError) {
            console.error('[FILTER DEBUG] Error checking items_v2 table:', tableError)
          } else {
            console.log('[FILTER DEBUG] items_v2 sample row:', tableInfo?.[0])
          }
        }
        
        // Use a subquery approach to find sales that have items matching the categories
        const { data: salesWithCategories, error: categoryError } = await supabase
          .from('items_v2')
          .select('sale_id')
          .in('category', dbCategories)
        
        if (categoryError) {
          console.error('[SALES] Category filter error:', categoryError)
          return NextResponse.json({
            ok: false,
            error: 'Category filter failed',
            code: (categoryError as any)?.code,
            details: (categoryError as any)?.message
          }, { status: 500 })
        }
        
        const saleIds = salesWithCategories?.map(item => item.sale_id) || []
        console.log('[SALES] Found sales with matching categories:', saleIds.length)
        
        // Debug server-side category filtering results
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[FILTER DEBUG] Server found saleIds:', saleIds.length, 'for categories:', dbCategories)
          console.log('[FILTER DEBUG] sqlParamsPreview =', dbCategories)
        }
        
        if (saleIds.length > 0) {
          query = query.in('id', saleIds)
        } else {
          // No sales match the categories, return empty result
          return NextResponse.json({
            ok: true,
            data: [],
            center: { lat: latitude, lng: longitude },
            distanceKm,
            count: 0,
            durationMs: Date.now() - startedAt
          })
        }
      }

      // Add text search
      if (q) {
        query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,address.ilike.%${q}%`)
      }
      
      // Fetch a wider slice to allow client-side distance filtering
      const fetchWindow = Math.min(1000, Math.max(limit * 10, 200))
      const { data: salesData, error: salesError } = await query
        .order('id', { ascending: true })
        .range(0, fetchWindow - 1)
      
      console.log(`[SALES] Direct query response:`, { 
        dataCount: salesData?.length || 0, 
        error: salesError,
        sampleData: salesData?.slice(0, 2),
        bboxUsed: actualBbox ? 'viewport' : 'distance-based',
        fetchWindow,
        limit,
        queryParams: {
          minLat, maxLat, minLng, maxLng,
          categories: categories.length,
          dateRange,
          startDateParam,
          endDateParam
        }
      })
      
      if (salesError) {
        console.error('Sales query error:', salesError)
        return NextResponse.json({
          ok: false,
          error: 'Database query failed',
          code: (salesError as any)?.code,
          details: (salesError as any)?.message || (salesError as any)?.details,
          hint: (salesError as any)?.hint,
          relation: 'public.sales_v2'
        }, { status: 500 })
      }
      
      // Calculate distances and filter by actual distance and date window (UTC date-only)
      const toUtcDateOnly = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00Z` : d)
      const windowStart = startDateParam ? toUtcDateOnly(startDateParam) : null
      const windowEnd = endDateParam ? new Date((toUtcDateOnly(endDateParam)).getTime() + 86399999) : null
      console.log('[SALES] Date filtering:', { startDateParam, endDateParam, windowStart, windowEnd })
      // If coordinates are null or missing, skip those rows
      const salesWithDistance = (salesData || [])
        .map((sale: Sale) => {
          const latNum = typeof sale.lat === 'number' ? sale.lat : parseFloat(String(sale.lat))
          const lngNum = typeof sale.lng === 'number' ? sale.lng : parseFloat(String(sale.lng))
          if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null
          return { ...sale, lat: latNum, lng: lngNum }
        })
        .filter((sale): sale is Sale & { lat: number; lng: number } => sale !== null && typeof sale.lat === 'number' && typeof sale.lng === 'number')
        .filter((sale) => {
          if (!sale) return false
          if (!windowStart && !windowEnd) return true
          // Build sale start/end
          const saleStart = sale.date_start ? new Date(`${sale.date_start}T${sale.time_start || '00:00:00'}`) : null
          const saleEnd = sale.date_end ? new Date(`${sale.date_end}T${sale.time_end || '23:59:59'}`) : null
          // If a date window is set, exclude rows with no date information to avoid always passing
          if ((windowStart || windowEnd) && !saleStart && !saleEnd) return false
          const s = saleStart || saleEnd
          const e = saleEnd || saleStart
          if (!s || !e) return false
          const startOk = !windowEnd || s <= windowEnd
          const endOk = !windowStart || e >= windowStart
          const passes = startOk && endOk
          if (windowStart && windowEnd) {
            console.log('[SALES] Date filter check:', { 
              saleId: sale.id, 
              saleStart: s?.toISOString(), 
              saleEnd: e?.toISOString(),
              windowStart: windowStart.toISOString(),
              windowEnd: windowEnd.toISOString(),
              passes 
            })
          }
          return passes
        })
        .map((sale: Sale | null) => {
          if (!sale) return null
          // Haversine distance calculation
          const R = 6371000 // Earth's radius in meters
          const dLat = ((sale.lat || 0) - latitude) * Math.PI / 180
          const dLng = ((sale.lng || 0) - longitude) * Math.PI / 180
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(latitude * Math.PI / 180) * Math.cos((sale.lat || 0) * Math.PI / 180) *
                   Math.sin(dLng/2) * Math.sin(dLng/2)
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
          const distanceM = R * c
          const distanceKm = distanceM / 1000
          
          return {
            ...sale,
            distance_m: Math.round(distanceM),
            distance_km: Math.round(distanceKm * 100) / 100
          }
        })
                .filter((sale) => {
                  // Only apply distance filtering if we're using distance-based search (not viewport bounds)
                  if (actualBbox) {
                    // When using viewport bounds, don't filter by distance - the bbox already defines the visible area
                    return sale !== null
                  } else {
                    // When using distance-based search, apply distance filtering
                    return sale && (sale.distance_km || 0) <= distanceKm
                  }
                })
                .sort((a, b) => {
                  if (!a || !b) return 0
                  // Primary sort: distance
                  if ((a.distance_m || 0) !== (b.distance_m || 0)) {
                    return (a.distance_m || 0) - (b.distance_m || 0)
                  }
                  // Secondary sort: date_start
                  const aStart = a.date_start ? new Date(`${a.date_start}T${a.time_start || '00:00:00'}`).getTime() : 0
                  const bStart = b.date_start ? new Date(`${b.date_start}T${b.time_start || '00:00:00'}`).getTime() : 0
                  if (aStart !== bStart) {
                    return aStart - bStart
                  }
                  // Tertiary sort: id (stable)
                  return a.id.localeCompare(b.id)
                })
                .slice(offset, offset + limit)
      
      console.log(`[SALES] Filtered ${salesWithDistance.length} sales within ${distanceKm}km`, { 
        windowStart, 
        windowEnd,
        bboxUsed: actualBbox ? 'viewport' : 'distance-based',
        finalCount: salesWithDistance.length
      })
      
      // Debug: Log sample sales and their dates
      if (salesWithDistance.length > 0) {
        console.log('[SALES] Sample filtered sales:', salesWithDistance.slice(0, 3).map(s => ({
          id: s?.id,
          title: s?.title,
          starts_at: s?.date_start ? `${s.date_start}T${s.time_start || '00:00:00'}` : null,
          date_start: s?.date_start,
          time_start: s?.time_start
        })))
      }
      
      // Debug: Log raw data before filtering
      console.log('[SALES] Raw data before filtering:', (salesData || []).slice(0, 3).map(s => ({
        id: s.id,
        title: s.title,
        starts_at: s.date_start ? `${s.date_start}T${s.time_start || '00:00:00'}` : null,
        date_start: s.date_start,
        time_start: s.time_start
      })))
      
      // Debug: Log date filtering details
      console.log('[SALES] Date filtering debug:', {
        windowStart: windowStart?.toISOString(),
        windowEnd: windowEnd?.toISOString(),
        totalSales: (salesData || []).length,
        salesWithValidCoords: (salesData || []).filter(s => s && typeof s.lat === 'number' && typeof s.lng === 'number').length
      })
      
      // Debug: Check if date filtering is actually being applied
      if (windowStart && windowEnd) {
        const salesBeforeDateFilter = (salesData || []).filter(s => s && typeof s.lat === 'number' && typeof s.lng === 'number')
        const salesAfterDateFilter = salesBeforeDateFilter.filter((sale: Sale) => {
          const saleStart = sale.date_start ? new Date(`${sale.date_start}T${sale.time_start || '00:00:00'}`) : null
          const saleEnd = sale.date_end ? new Date(`${sale.date_end}T${sale.time_end || '23:59:59'}`) : null
          if (!saleStart && !saleEnd) return true
          const s = saleStart || saleEnd
          const e = saleEnd || saleStart
          if (!s || !e) return true
          const startOk = !windowEnd || s <= windowEnd
          const endOk = !windowStart || e >= windowStart
          return startOk && endOk
        })
        console.log('[SALES] Date filter impact:', {
          beforeDateFilter: salesBeforeDateFilter.length,
          afterDateFilter: salesAfterDateFilter.length,
          filteredOut: salesBeforeDateFilter.length - salesAfterDateFilter.length
        })
      }
      
      if (salesWithDistance.length === 0) {
        // Degraded fallback: still honor filters (coords, date window, categories, distance) before returning
        degraded = true
        const fallbackFiltered = (salesData || [])
          // validate coordinates
          .map((row: any) => {
            const latNum = typeof row.lat === 'number' ? row.lat : parseFloat(String(row.lat))
            const lngNum = typeof row.lng === 'number' ? row.lng : parseFloat(String(row.lng))
            if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null
            return { ...row, lat: latNum, lng: lngNum }
          })
          .filter(Boolean)
          // date window overlap (exclude undated when window set)
          .filter((row: any) => {
            if (!windowStart && !windowEnd) return true
            const saleStart = row.date_start ? new Date(`${row.date_start}T${row.time_start || '00:00:00'}`) : null
            const saleEnd = row.date_end ? new Date(`${row.date_end}T${row.time_end || '23:59:59'}`) : null
            if (!saleStart && !saleEnd) return false
            const s = saleStart || saleEnd
            const e = saleEnd || saleStart
            if (!s || !e) return false
            const startOk = !windowEnd || s <= windowEnd
            const endOk = !windowStart || e >= windowStart
            return startOk && endOk
          })
          // categories fallback (title/description contains each category term)
          .filter((row: any) => {
            if (!Array.isArray(categories) || categories.length === 0) return true
            const text = `${row.title || ''} ${row.description || ''}`.toLowerCase()
            return categories.every((c: string) => text.includes(String(c || '').toLowerCase()))
          })
          // compute distance (meters) and filter by distanceKm
          .map((row: any) => {
            const R = 6371000
            const dLat = (row.lat - latitude) * Math.PI / 180
            const dLng = (row.lng - longitude) * Math.PI / 180
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                     Math.cos(latitude * Math.PI / 180) * Math.cos(row.lat * Math.PI / 180) *
                     Math.sin(dLng/2) * Math.sin(dLng/2)
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
            const distanceM = R * c
            return { ...row, distance_m: Math.round(distanceM) }
          })
          .filter((row: any) => row.distance_m <= (distanceKm * 1000))
          .sort((a: any, b: any) => a.distance_m - b.distance_m)
          .slice(0, limit)

        results = fallbackFiltered.map((row: any): PublicSale => ({
          id: row.id,
          // owner_id removed for security - not exposed in public API
          title: row.title,
          description: row.description,
          address: row.address,
          city: row.city,
          state: row.state,
          zip_code: row.zip_code,
          lat: row.lat,
          lng: row.lng,
          date_start: row.date_start || '',
          time_start: row.time_start || '',
          date_end: row.date_end,
          time_end: row.time_end,
          price: row.price,
          tags: row.tags || [],
          status: row.status || 'published',
          privacy_mode: row.privacy_mode || 'exact',
          is_featured: row.is_featured || false,
          created_at: row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
          distance_m: row.distance_m
        }))
      } else {
        results = salesWithDistance.map((row: any): PublicSale => ({
          id: row.id,
          // owner_id removed for security - not exposed in public API
          title: row.title,
          description: row.description,
          address: row.address,
          city: row.city,
          state: row.state,
          zip_code: row.zip_code,
          lat: row.lat,
          lng: row.lng,
          date_start: row.date_start || '',
          time_start: row.time_start || '',
          date_end: row.date_end,
          time_end: row.time_end,
          price: row.price,
          tags: row.tags || [],
          status: row.status || 'published',
          privacy_mode: row.privacy_mode || 'exact',
          is_featured: row.is_featured || false,
          created_at: row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
          distance_m: row.distance_m
        }))
      }
        
      console.log(`[SALES] Direct query success: ${results.length} results`)
      
    } catch (queryError: any) {
      console.log(`[SALES] Direct query failed: ${queryError.message}`)
      return NextResponse.json({ 
        ok: false, 
        error: 'Database query failed' 
      }, { status: 500 })
    }
    
    // 4. Return normalized response
    const response: any = {
      ok: true,
      data: results,
      center: { lat: latitude, lng: longitude },
      distanceKm,
      count: results.length,
      totalCount: totalSalesCount || 0, // Add total database count to response
      durationMs: Date.now() - startedAt
    }
    
    if (degraded) {
      response.degraded = true
    }
    
    console.log(`[SALES] Final result: ${results.length} sales, degraded=${degraded}, duration=${Date.now() - startedAt}ms`)
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300', // 1 min client, 5 min CDN
        'CDN-Cache-Control': 'public, max-age=300',
        'Vary': 'Accept-Encoding'
      }
    })
    
  } catch (error: any) {
    console.log(`[SALES][ERROR] Unexpected error: ${error?.message || error}`)
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[SALES] Auth failed:', { event: 'sales-create', status: 'fail', code: authError?.message })
      }
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    const body = await request.json()
    
    const { title, description, address, city, state, zip_code, lat, lng, date_start, time_start, date_end, time_end, tags: _tags, contact: _contact } = body
    
    // Ensure owner_id is set server-side from authenticated user
    // Never trust client payload for owner_id
    const { data, error } = await supabase
      .from('sales_v2')
      .insert({
        title,
        description,
        address,
        city,
        state,
        zip_code,
        lat,
        lng,
        date_start,
        time_start,
        date_end,
        time_end,
        status: 'published',
        owner_id: user.id // Server-side binding - never trust client
      })
      .select()
      .single()
    
    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[SALES] Insert failed:', { event: 'sales-create', status: 'fail', code: error.message })
      }
      console.error('Sales insert error:', error)
      return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SALES] Sale created:', { event: 'sales-create', status: 'ok', saleId: data.id })
    }
    
    return NextResponse.json({ ok: true, sale: data })
  } catch (error: any) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SALES] Unexpected error:', { event: 'sales-create', status: 'fail' })
    }
    console.error('Sales POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}