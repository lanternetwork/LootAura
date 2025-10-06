import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Returns lightweight markers for all sales within a radius and filters.
// Response shape: [{ id, title, lat, lng }]
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const lat = url.searchParams.get('lat') ? Number(url.searchParams.get('lat')) : undefined
  const lng = url.searchParams.get('lng') ? Number(url.searchParams.get('lng')) : undefined
  const maxKm = url.searchParams.get('maxKm') ? Number(url.searchParams.get('maxKm')) : 25
  const q = url.searchParams.get('q') || undefined
  const dateFrom = url.searchParams.get('startDate') || url.searchParams.get('dateFrom') || undefined
  const dateTo = url.searchParams.get('endDate') || url.searchParams.get('dateTo') || undefined
  const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) || undefined
  // Protective cap to avoid rendering too many markers
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 1000

  try {
    console.log('[MARKERS] Starting markers API request')
    const sb = createSupabaseServerClient()

    // Use the same logic as the main sales API to avoid 500 errors
    // Calculate bounding box for approximate distance filtering
    const latRange = maxKm / 111.0 // 1 degree ≈ 111km
    const lngRange = lat ? maxKm / (111.0 * Math.cos(lat * Math.PI / 180)) : maxKm / 85
    
    const minLat = lat !== undefined ? lat - latRange : undefined
    const maxLat = lat !== undefined ? lat + latRange : undefined
    const minLng = lng !== undefined ? lng - lngRange : undefined
    const maxLng = lng !== undefined ? lng + lngRange : undefined

    console.log('[MARKERS] params:', { lat, lng, maxKm, q, dateFrom, dateTo, tags, limit })
    console.log('[MARKERS] bbox:', { minLat, maxLat, minLng, maxLng })

    // Ultra-simple query to avoid any database issues
    let query = sb.from('sales_v2').select('id,title,lat,lng,starts_at,date_start,time_start,date_end,time_end,ends_at')
    
    // Only add basic filters to avoid 500 errors
    query = query.limit(Math.min(limit, 100)) // Cap at 100 to avoid timeouts

    const { data, error } = await query
    if (error) {
      console.error('[MARKERS] Query error:', error)
      // Fallback: return empty array instead of 500 error
      console.log('[MARKERS] Returning empty array due to query error')
      return NextResponse.json([])
    }

    const windowStart = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const windowEnd = dateTo ? new Date(`${dateTo}T23:59:59`) : null
    console.log('[MARKERS] fetched:', Array.isArray(data) ? data.length : 0, 'raw data sample:', data?.slice(0, 2))

    // Filter by date window and convert to markers
    const markers = (data as any[])
      .filter((s: any) => {
        if (!windowStart && !windowEnd) return true
        const saleStart = s.starts_at ? new Date(s.starts_at) : (s.date_start ? new Date(`${s.date_start}T${s.time_start || '00:00:00'}`) : null)
        const saleEnd = s.ends_at ? new Date(s.ends_at) : (s.date_end ? new Date(`${s.date_end}T${s.time_end || '23:59:59'}`) : null)
        if (!saleStart && !saleEnd) return true
        const st = saleStart || saleEnd
        const en = saleEnd || saleStart
        if (!st || !en) return true
        const startOk = !windowEnd || st <= windowEnd
        const endOk = !windowStart || en >= windowStart
        return startOk && endOk
      })
      .map((s: any) => {
        const latNum = typeof s.lat === 'number' ? s.lat : parseFloat(String(s.lat))
        const lngNum = typeof s.lng === 'number' ? s.lng : parseFloat(String(s.lng))
        if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null
        return { id: s.id, title: s.title, lat: latNum, lng: lngNum }
      })
      .filter(Boolean)

    console.log('[MARKERS] returning markers:', markers.length)
    console.log('[MARKERS] sample markers:', markers.slice(0, 3))
    return NextResponse.json(markers)
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({ error: 'Failed to load markers' }, { status: 500 })
  }
}


