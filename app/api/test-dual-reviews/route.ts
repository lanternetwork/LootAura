import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Create test users if they don't exist
    const testUsers = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'user1@test.com'
      },
      {
        id: '22222222-2222-2222-2222-222222222222', 
        email: 'user2@test.com'
      }
    ]

    for (const user of testUsers) {
      await supabase
        .from('auth.users')
        .upsert({
          id: user.id,
          email: user.email,
          encrypted_password: 'dummy_password',
          instance_id: '00000000-0000-0000-0000-000000000000',
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
    }

    // Create profiles for test users
    const { error: profilesError } = await supabase
      .from('profiles_v2')
      .upsert([
        {
          id: testUsers[0].id,
          username: 'user1',
          full_name: 'Test User 1'
        },
        {
          id: testUsers[1].id,
          username: 'user2', 
          full_name: 'Test User 2'
        }
      ])

    if (profilesError) {
      console.log('Error creating profiles:', profilesError.message)
    } else {
      console.log('Created user profiles successfully')
    }

    // Same address for both sales
    const testAddress = {
      address: '123 Test Street',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345',
      lat: 38.235,
      lng: -85.708
    }

    // Create two sales at the same address by different users
    const sales = [
      {
        id: '33333333-3333-3333-3333-333333333333',
        owner_id: testUsers[0].id,
        title: 'User 1 Yard Sale',
        description: 'First user at same address',
        ...testAddress,
        date_start: '2025-10-11',
        time_start: '09:00:00',
        date_end: '2025-10-11',
        time_end: '15:00:00',
        status: 'published'
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        owner_id: testUsers[1].id,
        title: 'User 2 Yard Sale', 
        description: 'Second user at same address',
        ...testAddress,
        date_start: '2025-10-12',
        time_start: '10:00:00',
        date_end: '2025-10-12',
        time_end: '16:00:00',
        status: 'published'
      }
    ]

    // Insert sales (without address_key for now)
    const { data: insertedSales, error: salesError } = await supabase
      .from('sales_v2')
      .upsert(sales)
      .select('id, title, owner_id')

    if (salesError) {
      throw new Error(`Failed to create sales: ${salesError.message}`)
    }

    // Create test reviews for each sale (now that migration is run)
    const reviews = [
      // Reviews for User 1's sale
      {
        sale_id: sales[0].id,
        user_id: testUsers[1].id, // User 2 reviews User 1's sale
        seller_id: sales[0].owner_id, // User 1 is the seller
        rating: 5,
        comment: 'Great sale by User 1!',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|11111111-1111-1111-1111-111111111111'
      },
      {
        sale_id: sales[0].id,
        user_id: '11111111-1111-1111-1111-111111111111', // Another user reviews User 1's sale
        seller_id: sales[0].owner_id, // User 1 is the seller
        rating: 4,
        comment: 'Good selection at User 1 sale',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|11111111-1111-1111-1111-111111111111'
      },
      // Reviews for User 2's sale  
      {
        sale_id: sales[1].id,
        user_id: testUsers[0].id, // User 1 reviews User 2's sale
        seller_id: sales[1].owner_id, // User 2 is the seller
        rating: 3,
        comment: 'User 2 had okay items',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|22222222-2222-2222-2222-222222222222'
      },
      {
        sale_id: sales[1].id,
        user_id: '22222222-2222-2222-2222-222222222222', // Another user reviews User 2's sale
        seller_id: sales[1].owner_id, // User 2 is the seller
        rating: 5,
        comment: 'Excellent sale by User 2!',
        address_key: '123 test street|test city|TS|12345',
        review_key: '123 test street|test city|TS|12345|22222222-2222-2222-2222-222222222222'
      }
    ]

    const { data: insertedReviews, error: reviewsError } = await supabase
      .from('reviews_v2')
      .upsert(reviews)

    if (reviewsError) {
      console.log('Error creating reviews:', reviewsError.message)
    } else {
      console.log('Created test reviews successfully')
    }

    // Get the sales data with address_key
    const { data: salesWithKeys, error: keysError } = await supabase
      .from('sales_v2')
      .select('id, title, owner_id, address_key')
      .in('id', [sales[0].id, sales[1].id])

    if (keysError) {
      throw new Error(`Failed to fetch sales: ${keysError.message}`)
    }

    // Compute review keys and get review counts
    const reviewCounts = []
    for (const sale of salesWithKeys || []) {
      const reviewKey = `${sale.address_key}|${sale.owner_id}`
      
      // Count reviews for this review_key
      const { count, error: countError } = await supabase
        .from('reviews_v2')
        .select('*', { count: 'exact', head: true })
        .eq('review_key', reviewKey)

      if (countError) {
        console.log(`Error counting reviews for ${sale.id}:`, countError.message)
      }

      reviewCounts.push({
        sale_id: sale.id,
        title: sale.title,
        address_key: sale.address_key,
        review_key: reviewKey,
        review_count: count || 0
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Dual-link review system test data created successfully',
      sales: salesWithKeys,
      review_counts: reviewCounts,
      address: testAddress
    })

  } catch (error: any) {
    console.error('Test dual reviews error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
