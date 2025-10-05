import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[CHECK-REVIEWS] Checking all reviews...')
    
    // Get all reviews
    const { data: allReviews, error: allError } = await supabase
      .from('reviews_v2')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (allError) {
      console.log('Error fetching all reviews:', allError.message)
    }
    
    // Get reviews by review_key
    const reviewKey1 = '123 test street|test city|TS|12345|11111111-1111-1111-1111-111111111111'
    const reviewKey2 = '123 test street|test city|TS|12345|22222222-2222-2222-2222-222222222222'
    
    const { data: reviews1, error: error1 } = await supabase
      .from('reviews_v2')
      .select('*')
      .eq('review_key', reviewKey1)
    
    const { data: reviews2, error: error2 } = await supabase
      .from('reviews_v2')
      .select('*')
      .eq('review_key', reviewKey2)
    
    console.log('Review key 1 results:', { data: reviews1, error: error1 })
    console.log('Review key 2 results:', { data: reviews2, error: error2 })
    
    return NextResponse.json({
      ok: true,
      total_reviews: allReviews?.length || 0,
      all_reviews: allReviews,
      review_key_1: {
        key: reviewKey1,
        count: reviews1?.length || 0,
        reviews: reviews1
      },
      review_key_2: {
        key: reviewKey2,
        count: reviews2?.length || 0,
        reviews: reviews2
      }
    })
    
  } catch (error: any) {
    console.error('Check all reviews error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
