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
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 1000

  try {
    console.log('[MARKERS] Starting markers API request')
    const sb = createSupabaseServerClient()

    // Use the exact same query as the main sales API that works
    const latRange = maxKm / 111.0
    const lngRange = lat ? maxKm / (111.0 * Math.cos(lat * Math.PI / 180)) : maxKm / 85
    
    const minLat = lat !== undefined ? lat - latRange : undefined
    const maxLat = lat !== undefined ? lat + latRange : undefined
    const minLng = lng !== undefined ? lng - lngRange : undefined
    const maxLng = lng !== undefined ? lng + lngRange : undefined

    console.log('[MARKERS] params:', { lat, lng, maxKm, q, dateFrom, dateTo, tags, limit })
    console.log('[MARKERS] bbox:', { minLat, maxLat, minLng, maxLng })

    // Use a simpler query to avoid 500 errors
    let query = sb.from('sales_v2').select('id,title,lat,lng,starts_at,date_start,time_start,date_end,time_end,ends_at')
    
    // Only add basic filters to avoid complex query issues
    query = query.limit(Math.min(limit, 500)) // Cap to avoid timeouts

    const { data, error } = await query
    if (error) {
      console.error('[MARKERS] Query error:', error)
      console.error('[MARKERS] Error details:', error.message, error.details, error.hint)
      return NextResponse.json({ error: 'Database query failed', details: error.message }, { status: 500 })
    }

    const windowStart = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const windowEnd = dateTo ? new Date(`${dateTo}T23:59:59`) : null
    console.log('[MARKERS] fetched:', Array.isArray(data) ? data.length : 0, 'raw data sample:', data?.slice(0, 2))

    // Simple filtering to avoid complex calculations that might cause 500 errors
    const markers = (data || [])
      .filter((sale: any) => {
        // Basic coordinate validation
        const latNum = typeof sale.lat === 'number' ? sale.lat : parseFloat(String(sale.lat))
        const lngNum = typeof sale.lng === 'number' ? sale.lng : parseFloat(String(sale.lng))
        return !Number.isNaN(latNum) && !Number.isNaN(lngNum)
      })
      .filter((sale: any) => {
        // Simple date filtering
        if (!windowStart && !windowEnd) return true
        const saleStart = sale.starts_at
          ? new Date(sale.starts_at)
          : (sale.date_start ? new Date(`${sale.date_start}T${sale.time_start || '00:00:00'}`) : null)
        const saleEnd = sale.ends_at
          ? new Date(sale.ends_at)
          : (sale.date_end ? new Date(`${sale.date_end}T${sale.time_end || '23:59:59'}`) : null)
        if (!saleStart && !saleEnd) return true
        const s = saleStart || saleEnd
        const e = saleEnd || saleStart
        if (!s || !e) return true
        const startOk = !windowEnd || s <= windowEnd
        const endOk = !windowStart || e >= windowStart
        return startOk && endOk
      })
      .slice(0, Math.min(limit, 100)) // Limit to avoid performance issues
      .map((sale: any) => {
        const latNum = typeof sale.lat === 'number' ? sale.lat : parseFloat(String(sale.lat))
        const lngNum = typeof sale.lng === 'number' ? sale.lng : parseFloat(String(sale.lng))
        return {
          id: sale.id,
          title: sale.title,
          lat: latNum,
          lng: lngNum
        }
      })

    console.log('[MARKERS] returning markers:', markers.length)
    console.log('[MARKERS] sample markers:', markers.slice(0, 3))
    return NextResponse.json(markers)
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({ error: 'Failed to load markers' }, { status: 500 })
  }
}


