import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { upsertSellerRating } from '@/lib/data/ratingsAccess'
import { Policies } from '@/lib/rateLimit/policies'
import { fail, ok } from '@/lib/http/json'
import { logger } from '@/lib/log'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'

const normalizeLockError = (response: NextResponse) => {
  if (response.status === 403) {
    return Response.json(
      {
        ok: false,
        code: 'ACCOUNT_LOCKED',
        error: {
          message: 'account_locked'
        },
      },
      { status: 403 }
    )
  }
  return response
}

async function postHandler(req: NextRequest) {
  try {
    // CSRF protection check
    const csrfError = await checkCsrfIfRequired(req)
    if (csrfError) {
      return csrfError
    }

    const supabase = await createSupabaseServerClient()

    // Auth check
    const authResponse = await supabase.auth.getUser()
    const user = authResponse?.data?.user
    const authError = authResponse?.error
    if (authError || !user) {
      logger.warn('Unauthorized rating attempt', {
        component: 'seller/rating',
        operation: 'auth_check',
      })
      return fail(401, 'AUTH_REQUIRED', 'Auth required')
    }

    const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
    await assertAccountNotLocked(user.id)

    // Rate limiting check (after auth so we have userId)
    const { check } = await import('@/lib/rateLimit/limiter')
    const { deriveKey } = await import('@/lib/rateLimit/keys')
    
    for (const policy of [Policies.RATING_MINUTE, Policies.RATING_HOURLY]) {
      const key = await deriveKey(req, policy.scope, user.id)
      const result = await check(policy, key)
      
      if (!result.allowed) {
        logger.warn('Rate limit exceeded for rating', {
          component: 'seller/rating',
          operation: 'rate_limit',
          userId: user.id,
        })
        return fail(429, 'RATE_LIMIT_EXCEEDED', 'Too many rating changes. Please try again later.')
      }
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return fail(400, 'INVALID_REQUEST', 'Missing required fields')
    }
    const { seller_id, rating, sale_id } = body as Record<string, unknown>

    // Validate required fields
    if (!seller_id || typeof seller_id !== 'string' || rating === undefined || rating === null) {
      return fail(400, 'INVALID_REQUEST', 'Missing required fields')
    }

    // Validate rating is integer between 1 and 5
    const ratingNum = Number(rating)
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return fail(400, 'INVALID_INPUT', 'rating must be an integer between 1 and 5')
    }

    // Validate seller_id is not the same as authenticated user
    if (seller_id === user.id) {
      return fail(400, 'INVALID_INPUT', 'Cannot rate yourself')
    }

    // Validate sale_id if provided
    if (sale_id !== undefined && sale_id !== null && typeof sale_id !== 'string') {
      return fail(400, 'INVALID_INPUT', 'sale_id must be a string or null')
    }

    // Upsert the rating
    const result = await upsertSellerRating(
      supabase,
      seller_id,
      user.id,
      ratingNum,
      (sale_id as string) || null
    )

    if (!result.success) {
      logger.error('Failed to save rating', new Error(result.error || 'Unknown error'), {
        component: 'seller/rating',
        operation: 'upsert_rating',
        userId: user.id,
        sellerId: seller_id,
      })
      return fail(400, 'RATING_SAVE_FAILED', result.error || 'Failed to save rating')
    }

    logger.info('Rating saved successfully', {
      component: 'seller/rating',
      operation: 'upsert_rating',
      userId: user.id,
      sellerId: seller_id,
      rating: ratingNum,
    })

    return ok({
      success: true,
      rating: ratingNum,
      summary: result.summary,
    })
  } catch (error) {
    if (error instanceof NextResponse) return normalizeLockError(error)
    logger.error('Seller rating error', error instanceof Error ? error : new Error(String(error)), {
      component: 'api/seller/rating',
    })
    return fail(500, 'INTERNAL_ERROR', 'Internal error')
  }
}

// Rate limiting is handled inside the handler after auth
// This allows us to use user-scoped policies with the authenticated user ID
export const POST = postHandler

