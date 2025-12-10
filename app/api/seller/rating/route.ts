import { type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { upsertSellerRating } from '@/lib/data/ratingsAccess'
import { Policies } from '@/lib/rateLimit/policies'
import { fail, ok } from '@/lib/http/json'
import { logger } from '@/lib/log'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'

async function postHandler(req: NextRequest) {
  // CSRF protection check
  const csrfError = await checkCsrfIfRequired(req)
  if (csrfError) {
    return csrfError
  }

  const supabase = createSupabaseServerClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    logger.warn('Unauthorized rating attempt', {
      component: 'seller/rating',
      operation: 'auth_check',
    })
    return fail(401, 'AUTH_REQUIRED', 'Authentication required')
  }
  try {
    const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
    await assertAccountNotLocked(user.id)
  } catch (error) {
    if (error instanceof Response) return error as any
    throw error
  }

  // Rate limiting check (after auth so we have userId)
  // We'll do this inline since we need userId from auth
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

  try {
    const body = await req.json()
    const { seller_id, rating, sale_id } = body

    // Validate required fields
    if (!seller_id || typeof seller_id !== 'string') {
      return fail(400, 'INVALID_INPUT', 'seller_id is required and must be a string')
    }

    if (rating === undefined || rating === null) {
      return fail(400, 'INVALID_INPUT', 'rating is required')
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
      sale_id || null
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
      rating: ratingNum,
      summary: result.summary,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }

    logger.error('Unexpected error in rating API', error instanceof Error ? error : new Error(String(error)), {
      component: 'seller/rating',
      operation: 'handler_execution',
      userId: user?.id,
    })

    return fail(500, 'INTERNAL_ERROR', 'An error occurred while saving your rating')
  }
}

// Rate limiting is handled inside the handler after auth
// This allows us to use user-scoped policies with the authenticated user ID
export const POST = postHandler

