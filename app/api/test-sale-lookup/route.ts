import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const saleId = '33333333-3333-3333-3333-333333333333'
    
    console.log(`[TEST-SALE] Looking up sale ID: ${saleId}`)
    
    // Test each accessible table
    const tables = ['sales_v2', 'sales', 'yard_sales']
    const results: any[] = []
    
    for (const tableName of tables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('id, title, address, city, state, address_key, owner_id')
          .eq('id', saleId)
          .single()
        
        results.push({
          table: tableName,
          found: !error && data,
          data: data,
          error: error?.message
        })
        
        if (!error && data) {
          console.log(`Found sale in ${tableName}:`, data)
        }
      } catch (err: any) {
        results.push({
          table: tableName,
          found: false,
          data: null,
          error: err.message
        })
      }
    }
    
    return NextResponse.json({
      ok: true,
      sale_id: saleId,
      results: results
    })
    
  } catch (error: any) {
    console.error('Test sale lookup error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
