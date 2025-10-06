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

    // Direct view query (robust fallback)
    // Rough degree conversions
    const kmPerDegLat = 111.0
    const latDelta = (maxKm || 25) / kmPerDegLat
    const lngDelta = lat ? (maxKm || 25) / (kmPerDegLat * Math.cos((lat * Math.PI) / 180)) : (maxKm || 25) / 85

    const minLat = lat !== undefined ? lat - latDelta : undefined
    const maxLat = lat !== undefined ? lat + latDelta : undefined
    const minLng = lng !== undefined ? lng - lngDelta : undefined
    const maxLng = lng !== undefined ? lng + lngDelta : undefined

    let query = sb.from('sales_v2').select('id,title,lat,lng')

    // Keep only safe filters to avoid schema mismatches
    if (q) {
      query = query.ilike('title', `%${q}%`)
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

    query = query.limit(limit)

    const { data, error } = await query
    if (error) throw error

    const markers = (data as any[])
      .map((s: any) => {
        const latNum = typeof s.lat === 'number' ? s.lat : parseFloat(String(s.lat))
        const lngNum = typeof s.lng === 'number' ? s.lng : parseFloat(String(s.lng))
        if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null
        return { id: s.id, title: s.title, lat: latNum, lng: lngNum }
      })
      .filter(Boolean)

    return NextResponse.json(markers)
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({ error: 'Failed to load markers' }, { status: 500 })
  }
}


