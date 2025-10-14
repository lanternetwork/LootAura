import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Create Supabase client with explicit public schema
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
    }

    const supabase = createServerClient(url, anon, {
      cookies: {
        get(name: string) {
          return cookies().get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookies().set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookies().set({ name, value: '', ...options, maxAge: 0 })
        },
      },
      // Use default public schema
    })

    const { searchParams } = new URL(request.url)
    
    // Parse query parameters
    const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat') || '0') : undefined
    const lng = searchParams.get('lng') ? parseFloat(searchParams.get('lng') || '0') : undefined
    const distanceKmParam = searchParams.get('distanceKm') ?? searchParams.get('distance')
    const distance = distanceKmParam ? parseFloat(distanceKmParam) : 25
    const city = searchParams.get('city') || undefined
    const categories = searchParams.get('categories')?.split(',') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit') || '50') : 50

    console.log(`[SALES_SEARCH] params lat=${lat}, lng=${lng}, distKm=${distance}, city=${city}, cats=${categories?.join(',')}, limit=${limit}`)

    // Use the new RPC function for spatial search
    let sales: any[] = []
    let error: any = null

    if (lat && lng) {
      // Use lat/lng-based distance filtering instead of geometry columns
      const { data: salesData, error: salesError } = await supabase
        .from('sales_v2')
        .select('*')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit * 3, 500)) // Fetch more to allow for distance filtering

      if (salesError) {
        error = salesError
      } else {
        // Client-side distance filtering using Haversine formula
        sales = (salesData || [])
          .map((sale: any) => {
            // Haversine distance calculation
            const R = 6371000 // Earth's radius in meters
            const dLat = (sale.lat - lat) * Math.PI / 180
            const dLng = (sale.lng - lng) * Math.PI / 180
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                     Math.cos(lat * Math.PI / 180) * Math.cos(sale.lat * Math.PI / 180) *
                     Math.sin(dLng/2) * Math.sin(dLng/2)
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
            const _distanceM = R * c
            
            return {
              ...sale,
              distance_m: Math.round(_distanceM),
              distance_km: Math.round(_distanceM / 1000 * 100) / 100
            }
          })
          .filter((sale: any) => sale.distance_km <= distance)
          .sort((a: any, b: any) => a.distance_m - b.distance_m)
          .slice(0, limit)
      }
    } else {
      // No location provided, use basic query on sales_v2
      const { data: basicData, error: basicError } = await supabase
        .from('sales_v2')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (basicError) {
        error = basicError
      } else {
        sales = basicData || []
      }
    }

    if (error) {
      console.error('Sales search error:', error)
      return NextResponse.json({ error: 'Failed to search sales', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ sales: sales || [] })
  } catch (error: any) {
    console.error('Sales search error:', error)
    return NextResponse.json({ error: 'Failed to search sales', detail: error.message }, { status: 500 })
  }
}
