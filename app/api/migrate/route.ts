import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[MIGRATE] Starting dual-link reviews system migration...')
    
    // Step 1: Add address_key column
    console.log('[MIGRATE] Step 1: Adding address_key column...')
    const { error: addColumnError } = await supabase
      .from('lootaura_v2.sales')
      .select('address_key')
      .limit(1)
    
    if (addColumnError && addColumnError.message.includes('does not exist')) {
      // Column doesn't exist, we need to add it
      console.log('Column does not exist, migration needed')
    } else {
      console.log('Column already exists or other error:', addColumnError?.message)
    }
    
    // Step 2: Test if we can query sales_v2
    console.log('[MIGRATE] Step 2: Testing sales_v2 access...')
    const { data: testSales, error: testError } = await supabase
      .from('sales_v2')
      .select('id, title')
      .limit(1)
    
    if (testError) {
      console.log('[MIGRATE] Error accessing sales_v2:', testError.message)
      return NextResponse.json({
        ok: false,
        error: `Cannot access sales_v2: ${testError.message}`,
        step: 'sales_v2_access'
      })
    }
    
    console.log('[MIGRATE] Successfully accessed sales_v2')
    
    return NextResponse.json({
      ok: true,
      message: 'Migration test successful - sales_v2 is accessible',
      test_data: testSales,
      next_steps: [
        'Run the migration SQL directly in Supabase dashboard',
        'Copy contents of supabase/migrations/037_simple_dual_link_reviews.sql',
        'Paste and execute in Supabase SQL editor'
      ]
    })
    
  } catch (error: any) {
    console.error('Migration test error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
