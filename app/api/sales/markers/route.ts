import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Markers API with server-side date and distance filtering
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const latParam = url.searchParams.get('lat')
    const lngParam = url.searchParams.get('lng')
    const maxKmParam = url.searchParams.get('maxKm')
    const startDate = url.searchParams.get('startDate') || url.searchParams.get('dateFrom') || undefined
    const endDate = url.searchParams.get('endDate') || url.searchParams.get('dateTo') || undefined
    const limitParam = url.searchParams.get('limit')

    const originLat = latParam ? Number(latParam) : undefined
    const originLng = lngParam ? Number(lngParam) : undefined
    const maxKm = maxKmParam ? Number(maxKmParam) : 25
    const limit = limitParam ? Math.min(Number(limitParam), 1000) : 1000

    const sb = createSupabaseServerClient()

    // Fetch a reasonably sized slice with required columns
    const { data, error } = await sb
      .from('sales_v2')
      .select('id, title, lat, lng, starts_at, date_start, time_start, date_end, time_end, ends_at')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id', { ascending: true })
      .range(0, 999)

    if (error) {
      console.error('Markers query error:', error)
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
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
        if (originLat == null || originLng == null) return { ...sale, distanceKm: 0 }
        const R = 6371
        const dLat = (sale.lat - originLat) * Math.PI / 180
        const dLng = (sale.lng - originLng) * Math.PI / 180
        const a = Math.sin(dLat/2) ** 2 + Math.cos(originLat * Math.PI/180) * Math.cos(sale.lat * Math.PI/180) * Math.sin(dLng/2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        const distanceKm = R * c
        return { ...sale, distanceKm }
      })
      .filter((sale: any) => originLat == null || originLng == null ? true : sale.distanceKm <= (maxKm || 25))

    const markers = filtered
      .slice(0, Math.min(limit, 1000))
      .map((sale: any) => ({ id: sale.id, title: sale.title, lat: sale.lat, lng: sale.lng }))

    return NextResponse.json(markers)
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({ error: 'Failed to load markers' }, { status: 500 })
  }
}


