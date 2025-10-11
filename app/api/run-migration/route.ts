import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Read the migration file
    const fs = require('fs')
    const path = require('path')
    
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/036_dual_link_reviews_system.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('[MIGRATION] Running dual-link reviews system migration...')
    
    // Split the migration into individual statements
    const statements = migrationSQL
      .split(';')
      .map((stmt: string) => stmt.trim())
      .filter((stmt: string) => stmt.length > 0 && !stmt.startsWith('--'))
    
    const results: any[] = []
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          console.log(`[MIGRATION] Executing: ${statement.substring(0, 100)}...`)
          const { data, error } = await supabase.rpc('exec_sql', { sql: statement })
          
          if (error) {
            console.log(`[MIGRATION] Error in statement: ${error.message}`)
            results.push({ statement: statement.substring(0, 100), error: error.message })
          } else {
            results.push({ statement: statement.substring(0, 100), success: true })
          }
        } catch (err: any) {
          console.log(`[MIGRATION] Exception in statement: ${err.message}`)
          results.push({ statement: statement.substring(0, 100), error: err.message })
        }
      }
    }
    
    // Check if the migration was successful by testing if address_key column exists
    const { data: testData, error: testError } = await supabase
      .from('sales_v2')
      .select('address_key')
      .limit(1)
    
    const migrationSuccess = !testError && testData !== null
    
    return NextResponse.json({
      ok: migrationSuccess,
      message: migrationSuccess ? 'Migration completed successfully' : 'Migration failed',
      results: results,
      test_result: {
        address_key_exists: !testError,
        test_error: testError?.message
      }
    })
    
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
