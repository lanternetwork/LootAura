import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[TEST-REVIEWS] Testing reviews creation...')
    
    // Test creating a simple review
    const testReview = {
      user_id: '11111111-1111-1111-1111-111111111111',
      seller_id: '11111111-1111-1111-1111-111111111111',
      sale_id: '33333333-3333-3333-3333-333333333333',
      rating: 5,
      comment: 'Test review creation',
      address: '123 Test Street', // Required field in reviews table
      address_key: '123 test street|test city|TS|12345',
      review_key: '123 test street|test city|TS|12345|11111111-1111-1111-1111-111111111111'
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('reviews_v2')
      .insert(testReview)
      .select('*')
    
    console.log('Review insert test:', { data: insertData, error: insertError })
    
    // Count existing reviews
    const { count: reviewCount, error: countError } = await supabase
      .from('reviews_v2')
      .select('*', { count: 'exact', head: true })
    
    console.log('Review count:', { count: reviewCount, error: countError })
    
    return NextResponse.json({
      ok: true,
      insert_success: !insertError,
      insert_error: insertError?.message,
      review_count: reviewCount || 0,
      count_error: countError?.message
    })
    
  } catch (error: any) {
    console.error('Test reviews creation error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
