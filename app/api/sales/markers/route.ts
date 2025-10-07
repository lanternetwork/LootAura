import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Simple markers API - just return sales as map pins
export async function GET(request: NextRequest) {
  try {
    const sb = createSupabaseServerClient()
    
    // Simple query - get all sales with coordinates
    const { data, error } = await sb
      .from('sales_v2')
      .select('id, title, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(100)

    if (error) {
      console.error('Markers query error:', error)
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
    }

    // Convert to markers format
    const markers = (data || [])
      .filter((sale: any) => {
        const lat = Number(sale.lat)
        const lng = Number(sale.lng)
        return !isNaN(lat) && !isNaN(lng)
      })
      .map((sale: any) => ({
        id: sale.id,
        title: sale.title,
        lat: Number(sale.lat),
        lng: Number(sale.lng)
      }))

    return NextResponse.json(markers)
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({ error: 'Failed to load markers' }, { status: 500 })
  }
}


