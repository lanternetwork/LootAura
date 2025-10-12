import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[TEST-MARKERS] Starting test')
    const sb = createSupabaseServerClient()
    
    // Test 1: Basic query
    console.log('[TEST-MARKERS] Test 1: Basic select')
    const { data: test1, error: error1 } = await sb.from('sales_v2').select('id,title,lat,lng').limit(5)
    console.log('[TEST-MARKERS] Test 1 result:', { data: test1?.length, error: error1 })
    
    if (error1) {
      return NextResponse.json({ 
        test: 'basic_select', 
        error: error1.message, 
        details: error1.details,
        hint: error1.hint 
      }, { status: 500 })
    }
    
    // Test 2: With bounding box
    console.log('[TEST-MARKERS] Test 2: With bounding box')
    const { data: test2, error: error2 } = await sb
      .from('sales_v2')
      .select('id,title,lat,lng')
      .gte('lat', 38)
      .lte('lat', 40)
      .gte('lng', -85)
      .lte('lng', -83)
      .limit(5)
    console.log('[TEST-MARKERS] Test 2 result:', { data: test2?.length, error: error2 })
    
    if (error2) {
      return NextResponse.json({ 
        test: 'bounding_box', 
        error: error2.message, 
        details: error2.details,
        hint: error2.hint 
      }, { status: 500 })
    }
    
    // Test 3: With range
    console.log('[TEST-MARKERS] Test 3: With range')
    const { data: test3, error: error3 } = await sb
      .from('sales_v2')
      .select('id,title,lat,lng')
      .order('id', { ascending: true })
      .range(0, 4)
    console.log('[TEST-MARKERS] Test 3 result:', { data: test3?.length, error: error3 })
    
    if (error3) {
      return NextResponse.json({ 
        test: 'with_range', 
        error: error3.message, 
        details: error3.details,
        hint: error3.hint 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      tests: {
        basic: test1?.length || 0,
        bbox: test2?.length || 0,
        range: test3?.length || 0
      }
    })
    
  } catch (error: any) {
    console.error('[TEST-MARKERS] Catch error:', error)
    return NextResponse.json({ 
      test: 'catch_error', 
      error: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}
