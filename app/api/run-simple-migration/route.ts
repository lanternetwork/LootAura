import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[SIMPLE-MIGRATION] Starting dual-link reviews system migration...')
    
    // Read the simplified migration file
    const fs = require('fs')
    const path = require('path')
    
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/037_simple_dual_link_reviews.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec', { sql: migrationSQL })
    
    if (error) {
      console.error('[SIMPLE-MIGRATION] Error:', error)
      return NextResponse.json({ 
        ok: false, 
        error: error.message 
      }, { status: 500 })
    }
    
    // Test the migration
    console.log('[SIMPLE-MIGRATION] Testing migration...')
    const { data: testData, error: testError } = await supabase
      .from('sales_v2')
      .select('id, address_key')
      .limit(1)
    
    const migrationSuccess = !testError && testData !== null
    
    return NextResponse.json({
      ok: migrationSuccess,
      message: migrationSuccess ? 'Migration completed successfully' : 'Migration failed',
      test_result: {
        address_key_exists: !testError,
        test_error: testError?.message,
        sample_data: testData
      }
    })
    
  } catch (error: any) {
    console.error('Simple migration error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
