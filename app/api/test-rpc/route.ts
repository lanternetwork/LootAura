import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[TEST-RPC] Testing RPC functions...')
    
    // Test 1: Check if functions exist
    const { data: functions, error: functionsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .eq('routine_schema', 'public')
      .like('routine_name', 'search_sales%')
    
    console.log('[TEST-RPC] Available functions:', functions)
    
    // Test 2: Try lat/lng-based distance filtering
    console.log('[TEST-RPC] Testing lat/lng-based distance filtering...')
    const { data: salesData, error: salesError } = await supabase
      .from('sales_v2')
      .select('id, title, city, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .eq('status', 'published')
      .limit(50)
    
    let filteredSales: any[] = []
    
    if (salesError) {
      console.log('[TEST-RPC] Sales query error:', salesError)
    } else {
      // Client-side distance filtering
      const testLat = 38.235
      const testLng = -85.708
      const testDistanceKm = 40
      
      filteredSales = (salesData || [])
        .map((sale: any) => {
          // Haversine distance calculation
          const R = 6371000 // Earth's radius in meters
          const dLat = (sale.lat - testLat) * Math.PI / 180
          const dLng = (sale.lng - testLng) * Math.PI / 180
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(testLat * Math.PI / 180) * Math.cos(sale.lat * Math.PI / 180) *
                   Math.sin(dLng/2) * Math.sin(dLng/2)
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
          const distanceM = R * c
          
          return {
            ...sale,
            distance_m: Math.round(distanceM),
            distance_km: Math.round(distanceM / 1000 * 100) / 100
          }
        })
        .filter((sale: any) => sale.distance_km <= testDistanceKm)
        .sort((a: any, b: any) => a.distance_m - b.distance_m)
        .slice(0, 5)
      
      console.log('[TEST-RPC] Lat/lng filtering result:', { data: filteredSales, count: filteredSales.length })
    }
    
    // Test 4: Try direct query to sales_v2 view
    console.log('[TEST-RPC] Testing direct sales_v2 query...')
    const { data: directData, error: directError } = await supabase
      .from('sales_v2')
      .select('id, title, city, lat, lng')
      .limit(5)
    
    console.log('[TEST-RPC] Direct query result:', { data: directData, error: directError })
    
    return NextResponse.json({
      ok: true,
      functions: functions,
      latlng_filtering: { data: filteredSales, count: filteredSales.length },
      direct: { data: directData, error: directError }
    })
    
  } catch (error: any) {
    console.log('[TEST-RPC] Error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
