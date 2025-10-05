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
    
    // Test 2: Try the PostGIS function
    console.log('[TEST-RPC] Testing search_sales_within_distance_v2...')
    const { data: postgisData, error: postgisError } = await supabase
      .rpc('search_sales_within_distance_v2', {
        p_lat: 38.235,
        p_lng: -85.708,
        p_distance_km: 40,
        p_start_date: null,
        p_end_date: null,
        p_categories: null,
        p_query: null,
        p_limit: 5,
        p_offset: 0
      })
    
    console.log('[TEST-RPC] PostGIS result:', { data: postgisData, error: postgisError })
    
    // Test 3: Try the bbox function
    console.log('[TEST-RPC] Testing search_sales_bbox_v2...')
    const { data: bboxData, error: bboxError } = await supabase
      .rpc('search_sales_bbox_v2', {
        p_lat: 38.235,
        p_lng: -85.708,
        p_distance_km: 40,
        p_start_date: null,
        p_end_date: null,
        p_categories: null,
        p_query: null,
        p_limit: 5,
        p_offset: 0
      })
    
    console.log('[TEST-RPC] Bbox result:', { data: bboxData, error: bboxError })
    
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
      postgis: { data: postgisData, error: postgisError },
      bbox: { data: bboxData, error: bboxError },
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
