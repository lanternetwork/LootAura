import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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
      searchParams.get('distanceKm') ? parseFloat(searchParams.get('distanceKm')!) : 40,
      160
    ))
    
    const dateRange = searchParams.get('dateRange') || 'any'
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    
    const categoriesParam = searchParams.get('categories')
    const categories = categoriesParam 
      ? categoriesParam.split(',').map(c => c.trim()).filter(c => c.length > 0).slice(0, 10)
      : []
    
    const q = searchParams.get('q')
    if (q && q.length > 64) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Search query too long' 
      }, { status: 400 })
    }
    
    const limit = Math.min(searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 24, 48)
    const offset = Math.max(searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0, 0)
    
    // Convert date range to start/end dates
    let startDateParam: string | null = null
    let endDateParam: string | null = null
    
    if (dateRange !== 'any') {
      if (startDate && endDate) {
        startDateParam = startDate
        endDateParam = endDate
      } else {
        // Handle predefined date ranges
        const now = new Date()
        switch (dateRange) {
          case 'today':
            startDateParam = now.toISOString().split('T')[0]
            endDateParam = now.toISOString().split('T')[0]
            break
          case 'weekend':
            const saturday = new Date(now)
            saturday.setDate(now.getDate() + (6 - now.getDay()))
            const sunday = new Date(saturday)
            sunday.setDate(saturday.getDate() + 1)
            startDateParam = saturday.toISOString().split('T')[0]
            endDateParam = sunday.toISOString().split('T')[0]
            break
          case 'next_weekend':
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
    
    let results: any[] = []
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
        .gte('lat', minLat)
        .lte('lat', maxLat)
        .gte('lng', minLng)
        .lte('lng', maxLng)
        .in('status', ['published', 'active'])
      
      // Add date filters
      if (startDateParam) {
        query = query.gte('date_start', startDateParam)
      }
      if (endDateParam) {
        query = query.lte('date_start', endDateParam)
      }
      
      // Add text search
      if (q) {
        query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,address.ilike.%${q}%`)
      }
      
      const { data: salesData, error: salesError } = await query
        .order('date_start', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit)
        .range(offset, offset + limit - 1)
      
      console.log(`[SALES] Direct query response:`, { data: salesData, error: salesError })
      
      if (salesError) {
        throw new Error(`Direct query failed: ${salesError.message}`)
      }
      
      // Calculate distances and filter by actual distance
      const salesWithDistance = (salesData || [])
        .map((sale: any) => {
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
                .filter((sale: any) => sale.distance_km <= distanceKm)
                .sort((a: any, b: any) => {
                  // Primary sort: distance
                  if (a.distance_m !== b.distance_m) {
                    return a.distance_m - b.distance_m
                  }
                  // Secondary sort: starts_at
                  if (a.starts_at !== b.starts_at) {
                    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
                  }
                  // Tertiary sort: id (stable)
                  return a.id.localeCompare(b.id)
                })
                .slice(0, limit)
      
      console.log(`[SALES] Filtered ${salesWithDistance.length} sales within ${distanceKm}km`)
      
      results = salesWithDistance.map((row: any) => ({
        id: row.id,
        title: row.title,
        starts_at: row.starts_at,
        ends_at: row.date_end ? `${row.date_end}T${row.time_end || '23:59:59'}` : null,
        latitude: row.lat,
        longitude: row.lng,
        city: row.city,
        state: row.state,
        zip: row.zip_code,
        categories: [], // TODO: Add categories support
        cover_image_url: null,
        distance_m: row.distance_m
      }))
        
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
    const body = await request.json()
    
    const { title, description, address, city, state, zip_code, lat, lng, date_start, time_start, date_end, time_end, tags, contact } = body
    
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
        owner_id: (await supabase.auth.getUser()).data.user?.id
      })
      .select()
      .single()
    
    if (error) {
      console.error('Sales insert error:', error)
      return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
    }
    
    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    console.error('Sales POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}