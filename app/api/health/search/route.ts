import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getDateWindow, saleOverlapsWindow } from '@/lib/date/dateWindows'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Only allow in preview/development
  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV?.includes('preview')) {
    return NextResponse.json({ ok: false, error: 'Not available in production' }, { status: 403 })
  }

  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // Parse parameters
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const distanceKm = searchParams.get('distanceKm')
    const dateRange = searchParams.get('dateRange')
    const categories = searchParams.get('cats')
    const q = searchParams.get('q')
    
    const parsed = {
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      distanceKm: distanceKm ? parseFloat(distanceKm) : null,
      dateRange: dateRange || null,
      categories: categories ? categories.split(',').map(c => c.trim()).filter(c => c.length > 0) : [],
      q: q || null
    }
    
    // Get total count
    const { count: totalCount } = await supabase
      .from('yard_sales')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
    
    let afterDistanceCount = totalCount
    let afterDateCount = totalCount
    let afterCategoriesCount = totalCount
    let afterTextCount = totalCount
    let degraded = false
    
    // Distance filtering using lat/lng coordinates
    if (parsed.lat && parsed.lng && parsed.distanceKm) {
      try {
        // Use lat/lng-based distance filtering instead of PostGIS
        const { data: salesData, error: salesError } = await supabase
          .from('sales_v2')
          .select('id, lat, lng')
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .eq('status', 'published')
          .limit(1000)
        
        if (salesError) {
          throw new Error(`Sales query failed: ${salesError.message}`)
        }
        
        // Client-side distance filtering using Haversine formula
        const filteredSales = (salesData || [])
          .map((sale: any) => {
            // Skip if parsed coordinates are null
            if (parsed.lat === null || parsed.lng === null) {
              return { ...sale, distanceM: 0 }
            }
            
            // Haversine distance calculation
            const R = 6371000 // Earth's radius in meters
            const dLat = (sale.lat - parsed.lat) * Math.PI / 180
            const dLng = (sale.lng - parsed.lng) * Math.PI / 180
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                     Math.cos(parsed.lat * Math.PI / 180) * Math.cos(sale.lat * Math.PI / 180) *
                     Math.sin(dLng/2) * Math.sin(dLng/2)
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
            const distanceM = R * c
            
            return {
              ...sale,
              distance_km: distanceM / 1000
            }
          })
          .filter((sale: any) => parsed.distanceKm === null || sale.distance_km <= parsed.distanceKm)
        
        afterDistanceCount = filteredSales.length
      } catch (error) {
        // Fallback to bounding box
        degraded = true
        const latRange = parsed.distanceKm / 111
        const lngRange = parsed.distanceKm / (111 * Math.cos(parsed.lat * Math.PI / 180))
        
        const { count } = await supabase
          .from('yard_sales')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('lat', parsed.lat - latRange)
          .lte('lat', parsed.lat + latRange)
          .gte('lng', parsed.lng - lngRange)
          .lte('lng', parsed.lng + lngRange)
        
        afterDistanceCount = count || 0
      }
    }
    
    // Date filtering
    if (parsed.dateRange && parsed.dateRange !== 'any') {
      const dateWindow = getDateWindow(parsed.dateRange)
      if (dateWindow) {
        // Get all sales in distance range and check date overlap
        const { data: salesData } = await supabase
          .from('yard_sales')
          .select('start_at, end_at')
          .eq('status', 'active')
          .limit(1000)
        
        if (salesData) {
          afterDateCount = salesData.filter(sale => 
            saleOverlapsWindow(sale.start_at, sale.end_at, dateWindow)
          ).length
        }
      }
    }
    
    // Category filtering
    if (parsed.categories.length > 0) {
      const { count } = await supabase
        .from('yard_sales')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .overlaps('tags', parsed.categories)
      
      afterCategoriesCount = count || 0
    }
    
    // Text filtering
    if (parsed.q) {
      const { count } = await supabase
        .from('yard_sales')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .or(`title.ilike.%${parsed.q}%,description.ilike.%${parsed.q}%,city.ilike.%${parsed.q}%`)
      
      afterTextCount = count || 0
    }
    
    return NextResponse.json({
      ok: true,
      parsed,
      counts: {
        total: totalCount || 0,
        afterDistance: afterDistanceCount,
        afterDate: afterDateCount,
        afterCategories: afterCategoriesCount,
        afterText: afterTextCount
      },
      ...(degraded && { degraded: true })
    })
    
  } catch (error: any) {
    console.error('[HEALTH_SEARCH] Error:', error.message)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
