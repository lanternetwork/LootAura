import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const sb = createSupabaseServerClient()
    
    // Test basic connection
    const { data, error } = await sb
      .from('sales_v2')
      .select('id, title, lat, lng')
      .limit(1)
    
    if (error) {
      return NextResponse.json({
        ok: false,
        error: 'Database connection failed',
        code: (error as any)?.code,
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint
      }, { status: 500 })
    }
    
    return NextResponse.json({
      ok: true,
      message: 'Database connection successful',
      sampleData: data,
      recordCount: data?.length || 0
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: 'Database test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
