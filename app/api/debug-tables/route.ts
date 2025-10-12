import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[DEBUG-TABLES] Testing table access...')
    
    // Test different table names
    const tests = [
      { name: 'sales_v2', table: 'sales_v2' },
      { name: 'sales', table: 'sales' },
      { name: 'yard_sales', table: 'yard_sales' },
      { name: 'lootaura_v2.sales', table: 'lootaura_v2.sales' }
    ]
    
    const results: any[] = []
    
    for (const test of tests) {
      try {
        const { data, error } = await supabase
          .from(test.table)
          .select('id, title')
          .limit(1)
        
        results.push({
          name: test.name,
          accessible: !error,
          error: error?.message,
          data_count: data?.length || 0
        })
      } catch (err: any) {
        results.push({
          name: test.name,
          accessible: false,
          error: err.message,
          data_count: 0
        })
      }
    }
    
    // Test specific sale ID
    const saleId = '33333333-3333-3333-3333-333333333333'
    let saleFound = false
    let saleError = ''
    
    for (const test of tests) {
      if (results.find(r => r.name === test.name)?.accessible) {
        try {
          const { data, error } = await supabase
            .from(test.table)
            .select('id, title, address_key, owner_id')
            .eq('id', saleId)
            .single()
          
          if (!error && data) {
            saleFound = true
            break
          }
        } catch (err: any) {
          saleError = err.message
        }
      }
    }
    
    return NextResponse.json({
      ok: true,
      table_tests: results,
      sale_id: saleId,
      sale_found: saleFound,
      sale_error: saleError
    })
    
  } catch (error: any) {
    console.error('Debug tables error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
