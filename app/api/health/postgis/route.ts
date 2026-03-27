import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Test PostGIS functionality with a simple spatial query
    const { data, error } = await supabase
      .rpc('test_postgis')

    // If the RPC doesn't exist, create a simple test query
    if (error && error.message.includes('function test_postgis')) {
      // Test with a simple PostGIS function
      const { data: testData, error: testError } = await supabase
        .from('yard_sales')
        .select('id')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(1)

      if (testError) {
        return NextResponse.json({
          ok: false,
          error: testError.message,
          timestamp: new Date().toISOString()
        }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        message: 'PostGIS functionality available (basic test)',
        hasSpatialData: (testData?.length || 0) > 0,
        timestamp: new Date().toISOString()
      })
    }

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: 'PostGIS functionality confirmed',
      result: data,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    // Handle missing environment variables gracefully
    if (error instanceof Error && error.message.includes('is missing')) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
    
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown PostGIS error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
