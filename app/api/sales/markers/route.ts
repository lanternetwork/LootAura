import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Markers API with server-side date, distance, and category filtering
// Response shape expected by SalesMap: plain array
// [{ id: string, title: string, lat: number, lng: number }]
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const url = new URL(request.url)
    const q = url.searchParams
    const latParam = q.get('lat')
    const lngParam = q.get('lng')
    const distanceParam = q.get('distanceKm')
    const startDate = q.get('dateFrom') || q.get('startDate') || undefined
    const endDate = q.get('dateTo') || q.get('endDate') || undefined
    
    console.log('[MARKERS API] Date params received: dateFrom=%s, dateTo=%s', startDate, endDate)
    const limitParam = q.get('limit')
    const catsParam = q.get('categories') || q.get('tags') || ''

    // Validate lat/lng
    const originLat = latParam !== null ? parseFloat(latParam) : NaN
    const originLng = lngParam !== null ? parseFloat(lngParam) : NaN
    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      return NextResponse.json({ error: 'Missing or invalid lat/lng' }, { status: 400 })
    }
    // Normalize distance (km)
    const distanceKm = Number.isFinite(parseFloat(String(distanceParam))) ? Math.max(0, parseFloat(String(distanceParam))) : 40
    const limit = Number.isFinite(parseFloat(String(limitParam))) ? Math.min(parseInt(String(limitParam), 10), 1000) : 1000
    const categories = catsParam ? catsParam.split(',').map(s => s.trim()).filter(Boolean) : []

    const sb = createSupabaseServerClient()

    // Fetch a slice with precisely the used columns from the public view
    const { data, error } = await sb
      .from('sales_v2')
      .select('id, title, description, lat, lng, starts_at, ends_at, date_start, date_end, time_start, time_end')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id', { ascending: true })
      .limit(Math.min(limit, 1000))

    if (error) {
      console.error('Markers query error:', error)
      return NextResponse.json({
        error: 'Database query failed',
        code: (error as any)?.code,
        details: (error as any)?.message || (error as any)?.details,
        hint: (error as any)?.hint,
        relation: 'public.sales_v2'
      }, { status: 500 })
    }

    // Date window (UTC date-only)
    const toUtcDateOnly = (isoLike: string) => new Date(isoLike.length === 10 ? `${isoLike}T00:00:00Z` : isoLike)
    const windowStart = startDate ? toUtcDateOnly(startDate) : undefined
    const windowEnd = endDate ? new Date((toUtcDateOnly(endDate)).getTime() + 86399999) : undefined

    const filtered = (data || [])
      .map((sale: any) => {
        const lat = Number(sale.lat)
        const lng = Number(sale.lng)
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null
        const saleStart = sale.starts_at
          ? new Date(sale.starts_at)
          : (sale.date_start ? toUtcDateOnly(sale.date_start) : undefined)
        const saleEnd = sale.ends_at
          ? new Date(sale.ends_at)
          : (sale.date_end ? new Date((toUtcDateOnly(sale.date_end)).getTime() + 86399999) : saleStart)
        return { ...sale, lat, lng, saleStart, saleEnd }
      })
      .filter(Boolean)
      .filter((sale: any) => {
        if (!windowStart && !windowEnd) return true
        if (!sale.saleStart && !sale.saleEnd) return false
        const s = sale.saleStart || sale.saleEnd
        const e = sale.saleEnd || sale.saleStart
        if (!s || !e) return false
        const startOk = !windowEnd || s <= windowEnd
        const endOk = !windowStart || e >= windowStart
        return startOk && endOk
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

    // Return structured response matching /api/sales format
    return NextResponse.json({
      ok: true,
      data: markers,
      center: { lat: originLat, lng: originLng },
      distanceKm,
      count: markers.length,
      durationMs: Date.now() - startedAt
    })
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Database query failed',
      code: (error as any)?.code,
      details: (error as any)?.message || (error as any)?.details,
      hint: (error as any)?.hint,
      relation: 'public.sales_v2'
    }, { status: 500 })
  }
}


