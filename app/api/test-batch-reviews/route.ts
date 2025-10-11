import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[TEST-BATCH-REVIEWS] Testing batch reviews insertion...')
    
    // Create the 4 reviews one by one to see which ones fail
    const reviews = [
      {
        sale_id: '33333333-3333-3333-3333-333333333333',
        user_id: '22222222-2222-2222-2222-222222222222', // User 2 reviews User 1's sale
        seller_id: '11111111-1111-1111-1111-111111111111', // User 1 is the seller
        rating: 5,
        comment: 'Great sale by User 1!',
        address: '123 Test Street',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|11111111-1111-1111-1111-111111111111'
      },
      {
        sale_id: '33333333-3333-3333-3333-333333333333',
        user_id: '11111111-1111-1111-1111-111111111111', // Another user reviews User 1's sale
        seller_id: '11111111-1111-1111-1111-111111111111', // User 1 is the seller
        rating: 4,
        comment: 'Good selection at User 1 sale',
        address: '123 Test Street',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|11111111-1111-1111-1111-111111111111'
      },
      {
        sale_id: '44444444-4444-4444-4444-444444444444',
        user_id: '11111111-1111-1111-1111-111111111111', // User 1 reviews User 2's sale
        seller_id: '22222222-2222-2222-2222-222222222222', // User 2 is the seller
        rating: 3,
        comment: 'User 2 had okay items',
        address: '123 Test Street',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|22222222-2222-2222-2222-222222222222'
      },
      {
        sale_id: '44444444-4444-4444-4444-444444444444',
        user_id: '22222222-2222-2222-2222-222222222222', // Another user reviews User 2's sale
        seller_id: '22222222-2222-2222-2222-222222222222', // User 2 is the seller
        rating: 5,
        comment: 'Excellent sale by User 2!',
        address: '123 Test Street',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|22222222-2222-2222-2222-222222222222'
      }
    ]
    
    const results = []
    
    for (let i = 0; i < reviews.length; i++) {
      const review = reviews[i]
      console.log(`Inserting review ${i + 1}:`, review)
      
      try {
        const { data, error } = await supabase
          .from('reviews_v2')
          .insert(review)
          .select('*')
        
        results.push({
          review_index: i + 1,
          success: !error,
          error: error?.message,
          data: data
        })
        
        console.log(`Review ${i + 1} result:`, { success: !error, error: error?.message })
      } catch (err: any) {
        results.push({
          review_index: i + 1,
          success: false,
          error: err.message,
          data: null
        })
        console.log(`Review ${i + 1} error:`, err.message)
      }
    }
    
    // Check total reviews after all insertions
    const { data: allReviews, error: allError } = await supabase
      .from('reviews_v2')
      .select('*')
    
    console.log('Total reviews after batch insert:', allReviews?.length || 0)
    
    return NextResponse.json({
      ok: true,
      results: results,
      total_reviews: allReviews?.length || 0,
      all_reviews: allReviews
    })
    
  } catch (error: any) {
    console.error('Test batch reviews error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
