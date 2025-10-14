import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Sale } from '@/lib/types'
import { validateDateRange } from '@/lib/shared/dateBounds'
import { normalizeCategories } from '@/lib/shared/categoryNormalizer'
import { toDbSet } from '@/lib/shared/categoryContract'

// CRITICAL: This API MUST require lat/lng - never remove this validation
// See docs/AI_ASSISTANT_RULES.md for full guidelines
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // 1. Parse & validate required location
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    
    if (!lat || !lng) {
      console.log(`[SALES] Missing location: lat=${lat}, lng=${lng}`)
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing location' 
      }, { status: 400 })
    }
    
    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)
    
    if (isNaN(latitude) || isNaN(longitude)) {
      console.log(`[SALES] Invalid location: lat=${lat}, lng=${lng}`)
      return NextResponse.json({ 
        ok: false, 
        error: 'Invalid location coordinates' 
      }, { status: 400 })
    }
    
    // 2. Parse & validate other parameters
    const distanceKm = Math.max(1, Math.min(
      searchParams.get('distanceKm') ? parseFloat(searchParams.get('distanceKm') || '40') : 40,
      160
    ))
    
    const dateRange = searchParams.get('dateRange') || 'any'
    const startDate = searchParams.get('from') || searchParams.get('dateFrom') || searchParams.get('startDate') || undefined
    const endDate = searchParams.get('to') || searchParams.get('dateTo') || searchParams.get('endDate') || undefined
    
    
    // Accept both canonical 'categories' and legacy 'cat' parameters
    const categoriesParam = searchParams.get('categories') || searchParams.get('cat')
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
    
    const limit = Math.min(searchParams.get('limit') ? parseInt(searchParams.get('limit') || '24') : 24, 48)
    const offset = Math.max(searchParams.get('offset') ? parseInt(searchParams.get('offset') || '0') : 0, 0)
    
    // Validate date range parameters
    const dateValidation = validateDateRange(startDate, endDate)
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
    
    let results: Sale[] = []
    let degraded = false
    
    // 3. Use direct query to sales_v2 view (RPC functions have permission issues)
    try {
      console.log(`[SALES] Querying sales_v2 view directly...`)
      
      // Calculate bounding box for approximate distance filtering
      const latRange = distanceKm / 111.0 // 1 degree ≈ 111km
      const lngRange = distanceKm / (111.0 * Math.cos(latitude * Math.PI / 180))
      
      const minLat = latitude - latRange
      const maxLat = latitude + latRange
      const minLng = longitude - lngRange
      const maxLng = longitude + lngRange
      
      console.log(`[SALES] Bounding box: lat=${minLat} to ${maxLat}, lng=${minLng} to ${maxLng}`)
      
      let query = supabase
        .from('sales_v2')
        .select('*')
      
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
        sampleData: salesData?.slice(0, 2)
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
        .filter((sale: Sale | null) => sale && typeof sale.lat === 'number' && typeof sale.lng === 'number')
        .filter((sale: Sale) => {
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
        .map((sale: Sale) => {
          // Haversine distance calculation
          const R = 6371000 // Earth's radius in meters
          const dLat = (sale.lat - latitude) * Math.PI / 180
          const dLng = (sale.lng - longitude) * Math.PI / 180
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(latitude * Math.PI / 180) * Math.cos(sale.lat * Math.PI / 180) *
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
                .filter((sale: Sale) => sale.distance_km <= distanceKm)
                .sort((a: Sale, b: Sale) => {
                  // Primary sort: distance
                  if (a.distance_m !== b.distance_m) {
                    return a.distance_m - b.distance_m
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
      
      console.log(`[SALES] Filtered ${salesWithDistance.length} sales within ${distanceKm}km`, { windowStart, windowEnd })
      
      // Debug: Log sample sales and their dates
      if (salesWithDistance.length > 0) {
        console.log('[SALES] Sample filtered sales:', salesWithDistance.slice(0, 3).map(s => ({
          id: s.id,
          title: s.title,
          starts_at: s.date_start ? `${s.date_start}T${s.time_start || '00:00:00'}` : null,
          date_start: s.date_start,
          time_start: s.time_start
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

        results = fallbackFiltered.map((row: any) => ({
          id: row.id,
          title: row.title,
          starts_at: row.date_start ? `${row.date_start}T${row.time_start || '08:00:00'}` : null,
          ends_at: row.date_end ? `${row.date_end}T${row.time_end || '23:59:59'}` : null,
          lat: row.lat,
          lng: row.lng,
          city: row.city,
          state: row.state,
          zip: row.zip_code,
          categories: row.tags || [],
          cover_image_url: null,
          distance_m: row.distance_m
        }))
      } else {
        results = salesWithDistance.map((row: any) => ({
          id: row.id,
          title: row.title,
          // Map to common fields
          starts_at: row.date_start ? `${row.date_start}T${row.time_start || '08:00:00'}` : null,
          ends_at: row.date_end ? `${row.date_end}T${row.time_end || '23:59:59'}` : null,
          lat: row.lat,
          lng: row.lng,
          city: row.city,
          state: row.state,
          zip: row.zip_code,
          categories: row.tags || [],
          cover_image_url: null,
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
      durationMs: Date.now() - startedAt
    }
    
    if (degraded) {
      response.degraded = true
    }
    
    console.log(`[SALES] Final result: ${results.length} sales, degraded=${degraded}, duration=${Date.now() - startedAt}ms`)
    
    return NextResponse.json(response)
    
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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    const body = await request.json()
    
    const { title, description, address, city, state, zip_code, lat, lng, date_start, time_start, date_end, time_end, tags: _tags, contact: _contact } = body
    
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
        owner_id: user.id
      })
      .select()
      .single()
    
    if (error) {
      console.error('Sales insert error:', error)
      return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
    }
    
    return NextResponse.json({ ok: true, sale: data })
  } catch (error: any) {
    console.error('Sales POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}