import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Check if admin tools are enabled
    if (process.env.ENABLE_ADMIN_TOOLS !== 'true') {
      return NextResponse.json({ 
        ok: false, 
        error: 'Admin tools disabled' 
      }, { status: 403 })
    }
    
    // Fetch ALL sales for world view (no location filtering)
    const { data: salesData, error } = await supabase
      .from('sales_v2')
      .select('id, title, lat, lng, city, state, status')
      .in('status', ['published', 'active'])
      .order('created_at', { ascending: false })
      .limit(1000) // Cap at 1000 for performance
    
    if (error) {
      console.error('[ADMIN_SALES] Query error:', error)
      return NextResponse.json({ 
        ok: false, 
        error: 'Database query failed' 
      }, { status: 500 })
    }
    
    const results = (salesData || []).map((sale: any) => ({
      id: sale.id,
      title: sale.title,
      lat: Number(sale.lat),
      lng: Number(sale.lng),
      city: sale.city,
      state: sale.state,
      status: sale.status
    }))
    
    console.log(`[ADMIN_SALES] Returning ${results.length} sales for world view`)
    
    return NextResponse.json({
      ok: true,
      data: results,
      count: results.length
    })
    
  } catch (error: any) {
    console.error('[ADMIN_SALES] Error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
