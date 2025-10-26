import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import * as dateBounds from '@/lib/shared/dateBounds'

export async function POST(request: NextRequest) {
  try {
    const { zipCode, dateRange } = await request.json()
    
    if (!zipCode) {
      return NextResponse.json({ 
        error: 'ZIP code is required' 
      }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    // Get ZIP code coordinates (simplified - you might want to use a real geocoding service)
    const zipCoordinates: { [key: string]: { lat: number; lng: number; city: string; state: string } } = {
      '40204': { lat: 38.2350, lng: -85.7080, city: 'Louisville', state: 'KY' },
      '40202': { lat: 38.2527, lng: -85.7585, city: 'Louisville', state: 'KY' },
      '40206': { lat: 38.2400, lng: -85.7200, city: 'Louisville', state: 'KY' },
      '40207': { lat: 38.2500, lng: -85.6500, city: 'Louisville', state: 'KY' },
      '40217': { lat: 38.2200, lng: -85.7500, city: 'Louisville', state: 'KY' }
    }

    const coords = zipCoordinates[zipCode]
    if (!coords) {
      return NextResponse.json({ 
        error: `ZIP code ${zipCode} not found in test data` 
      }, { status: 400 })
    }

    // 1. Get total sales count
    const { count: totalSales, error: totalError } = await supabase
      .from('sales_v2')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')

    if (totalError) {
      console.error('Total sales count error:', totalError)
    }

    // 2. Get sales in city
    const { count: salesInCity, error: cityError } = await supabase
      .from('sales_v2')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .ilike('city', `%${coords.city}%`)

    if (cityError) {
      console.error('City sales count error:', cityError)
    }

    // 3. Get sales in bbox (50km radius)
    const latRange = 0.45 // ~50km
    const lngRange = 0.45 // ~50km
    const minLat = coords.lat - latRange
    const maxLat = coords.lat + latRange
    const minLng = coords.lng - lngRange
    const maxLng = coords.lng + lngRange

    const { count: salesInBbox, error: bboxError } = await supabase
      .from('sales_v2')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('lat', minLat)
      .lte('lat', maxLat)
      .gte('lng', minLng)
      .lte('lng', maxLng)

    if (bboxError) {
      console.error('Bbox sales count error:', bboxError)
    }

    // 4. Get sales in date range
    let salesInDateRange = 0
    if (dateRange !== 'any') {
      const dateConstraints = dateBounds.getDateRange(dateRange as any)
      if (dateConstraints) {
        const { count, error: dateError } = await supabase
          .from('sales_v2')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .gte('date_start', dateConstraints.start)
          .lte('date_start', dateConstraints.end)

        if (dateError) {
          console.error('Date range sales count error:', dateError)
        } else {
          salesInDateRange = count || 0
        }
      }
    } else {
      salesInDateRange = totalSales || 0
    }

    // 5. Get sample sales for the bbox
    const { data: sampleSales, error: sampleError } = await supabase
      .from('sales_v2')
      .select('id, title, city, state, date_start, lat, lng')
      .eq('status', 'published')
      .gte('lat', minLat)
      .lte('lat', maxLat)
      .gte('lng', minLng)
      .lte('lng', maxLng)
      .limit(10)

    if (sampleError) {
      console.error('Sample sales error:', sampleError)
    }

    return NextResponse.json({
      totalSales: totalSales || 0,
      salesInBbox: salesInBbox || 0,
      salesInCity: salesInCity || 0,
      salesInDateRange,
      sampleSales: sampleSales || [],
      zipCode,
      coordinates: coords,
      bbox: { minLat, maxLat, minLng, maxLng }
    })

  } catch (error) {
    console.error('Sales data test error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
