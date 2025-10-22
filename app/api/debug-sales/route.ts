import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Get all sales without any filtering
    const { data: salesData, error: salesError } = await supabase
      .from('sales_v2')
      .select('*')
      .limit(10)
    
    console.log(`[DEBUG-SALES] Raw query response:`, { 
      dataCount: salesData?.length || 0, 
      error: salesError,
      sampleData: salesData?.slice(0, 2)
    })
    
    return NextResponse.json({
      ok: true,
      count: salesData?.length || 0,
      sales: salesData || [],
      error: salesError
    })
    
  } catch (error: any) {
    console.log(`[DEBUG-SALES] Error: ${error?.message || error}`)
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || 'Internal server error' 
    }, { status: 500 })
  }
}
