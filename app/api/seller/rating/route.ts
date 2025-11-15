import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { upsertSellerRating, getSellerRatingSummary } from '@/lib/data/ratingsAccess'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

async function postHandler(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limiting check (after auth so we have userId)
  // We'll do this inline since we need userId from auth
  const { check } = await import('@/lib/rateLimit/limiter')
  const { deriveKey } = await import('@/lib/rateLimit/keys')
  
  for (const policy of [Policies.RATING_MINUTE, Policies.RATING_HOURLY]) {
    const key = await deriveKey(req, policy.scope, user.id)
    const result = await check(policy, key)
    
    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many rating changes. Please try again later.' },
        { status: 429 }
      )
    }
  }

  try {
    const body = await req.json()
    const { seller_id, rating, sale_id } = body

    // Validate required fields
    if (!seller_id || typeof seller_id !== 'string') {
      return NextResponse.json(
        { error: 'seller_id is required and must be a string' },
        { status: 400 }
      )
    }

    if (rating === undefined || rating === null) {
      return NextResponse.json(
        { error: 'rating is required' },
        { status: 400 }
      )
    }

    // Validate rating is integer between 1 and 5
    const ratingNum = Number(rating)
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json(
        { error: 'rating must be an integer between 1 and 5' },
        { status: 400 }
      )
    }

    // Validate seller_id is not the same as authenticated user
    if (seller_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot rate yourself' },
        { status: 400 }
      )
    }

    // Validate sale_id if provided
    if (sale_id !== undefined && sale_id !== null && typeof sale_id !== 'string') {
      return NextResponse.json(
        { error: 'sale_id must be a string or null' },
        { status: 400 }
      )
    }

    // Upsert the rating
    const result = await upsertSellerRating(
      supabase,
      seller_id,
      user.id,
      ratingNum,
      sale_id || null
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to save rating' },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[RATING_API] Rating saved:', {
        sellerId: seller_id,
        raterId: user.id,
        rating: ratingNum,
        saleId: sale_id || null,
      })
    }

    return NextResponse.json({
      ok: true,
      rating: ratingNum,
      summary: result.summary,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    console.error('[RATING_API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Rate limiting is handled inside the handler after auth
// This allows us to use user-scoped policies with the authenticated user ID
export const POST = postHandler

