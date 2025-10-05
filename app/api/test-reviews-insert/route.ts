import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[TEST-REVIEWS-INSERT] Testing reviews insertion...')
    
    // Test creating one review at a time
    const testReview = {
      sale_id: '33333333-3333-3333-3333-333333333333',
      user_id: '22222222-2222-2222-2222-222222222222', // User 2 reviews User 1's sale
      seller_id: '11111111-1111-1111-1111-111111111111', // User 1 is the seller
      rating: 5,
      comment: 'Great sale by User 1!',
      address: '123 Test Street',
      address_key: '123 test street|test city|TS|12345',
      review_key: '123 test street|test city|TS|12345|11111111-1111-1111-1111-111111111111'
    }
    
    console.log('Attempting to insert review:', testReview)
    
    const { data: insertData, error: insertError } = await supabase
      .from('reviews_v2')
      .insert(testReview)
      .select('*')
    
    console.log('Insert result:', { data: insertData, error: insertError })
    
    // Check total reviews after insert
    const { data: allReviews, error: allError } = await supabase
      .from('reviews_v2')
      .select('*')
    
    console.log('Total reviews after insert:', allReviews?.length || 0)
    
    return NextResponse.json({
      ok: true,
      insert_success: !insertError,
      insert_error: insertError?.message,
      insert_data: insertData,
      total_reviews: allReviews?.length || 0,
      all_reviews: allReviews
    })
    
  } catch (error: any) {
    console.error('Test reviews insert error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
