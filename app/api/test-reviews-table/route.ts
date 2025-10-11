import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[TEST-REVIEWS] Testing reviews table access...')
    
    // Test if reviews_v2 view exists
    const { data: reviewsData, error: reviewsError } = await supabase
      .from('reviews_v2')
      .select('*')
      .limit(1)
    
    console.log('Reviews_v2 test:', { data: reviewsData, error: reviewsError })
    
    // Test if we can insert into reviews_v2
    const { data: insertData, error: insertError } = await supabase
      .from('reviews_v2')
      .insert({
        user_id: '11111111-1111-1111-1111-111111111111',
        rating: 5,
        comment: 'Test review',
        sale_id: '33333333-3333-3333-3333-333333333333'
      })
      .select('*')
    
    console.log('Reviews_v2 insert test:', { data: insertData, error: insertError })
    
    return NextResponse.json({
      ok: true,
      reviews_access: reviewsError ? false : true,
      reviews_error: reviewsError?.message,
      insert_access: insertError ? false : true,
      insert_error: insertError?.message,
      reviews_count: reviewsData?.length || 0
    })
    
  } catch (error: any) {
    console.error('Test reviews table error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
