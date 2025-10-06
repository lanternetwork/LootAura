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
    const sb = createSupabaseServerClient()

    // Prefer RPC if available (Option A). Try search_sales_within_distance, then search_sales.
    try {
      const { data, error } = await sb.rpc('search_sales_within_distance', {
        search_query: q || null,
        max_distance_km: maxKm || null,
        user_lat: lat || null,
        user_lng: lng || null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        price_min: null,
        price_max: null,
        tags_filter: tags || null,
        limit_count: limit,
        offset_count: 0,
      })

      if (!error && Array.isArray(data)) {
        const markers = (data as any[])
          .filter((s: any) => typeof s.lat === 'number' && typeof s.lng === 'number')
          .map((s: any) => ({ id: s.id, title: s.title, lat: s.lat, lng: s.lng }))
        return NextResponse.json(markers)
      }
    } catch (_) {
      // Fall through to alternate strategies
    }

    try {
      const { data, error } = await sb.rpc('search_sales', {
        search_query: q || null,
        max_distance_km: maxKm || null,
        user_lat: lat || null,
        user_lng: lng || null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        price_min: null,
        price_max: null,
        tags_filter: tags || null,
        limit_count: limit,
        offset_count: 0,
      })
      if (!error && Array.isArray(data)) {
        const markers = (data as any[])
          .filter((s: any) => typeof s.lat === 'number' && typeof s.lng === 'number')
          .map((s: any) => ({ id: s.id, title: s.title, lat: s.lat, lng: s.lng }))
        return NextResponse.json(markers)
      }
    } catch (_) {
      // Fall through to bbox fallback
    }

    // BBox fallback on public view if RPCs are missing.
    // Rough degree conversions
    const kmPerDegLat = 111.0
    const latDelta = (maxKm || 25) / kmPerDegLat
    const lngDelta = lat ? (maxKm || 25) / (kmPerDegLat * Math.cos((lat * Math.PI) / 180)) : (maxKm || 25) / 85

    const minLat = lat !== undefined ? lat - latDelta : undefined
    const maxLat = lat !== undefined ? lat + latDelta : undefined
    const minLng = lng !== undefined ? lng - lngDelta : undefined
    const maxLng = lng !== undefined ? lng + lngDelta : undefined

    let query = sb.from('sales_v2').select('id,title,lat,lng').limit(limit)

    if (q) {
      query = query.ilike('title', `%${q}%`)
    }
    if (dateFrom) {
      query = query.gte('date_start', dateFrom)
    }
    if (dateTo) {
      query = query.lte('date_end', dateTo)
    }
    if (Array.isArray(tags) && tags.length > 0) {
      query = query.contains('tags', tags)
    }
    if (
      minLat !== undefined && maxLat !== undefined &&
      minLng !== undefined && maxLng !== undefined
    ) {
      query = query
        .gte('lat', minLat)
        .lte('lat', maxLat)
        .gte('lng', minLng)
        .lte('lng', maxLng)
    }

    const { data, error } = await query
    if (error) throw error

    const markers = (data as any[])
      .filter((s: any) => typeof s.lat === 'number' && typeof s.lng === 'number')
      .map((s: any) => ({ id: s.id, title: s.title, lat: s.lat, lng: s.lng }))

    return NextResponse.json(markers)
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({ error: 'Failed to load markers' }, { status: 500 })
  }
}


