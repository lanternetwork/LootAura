/**
 * Create PaymentIntent for Promotion
 * POST /api/promotions/intent
 * 
 * Creates a PaymentIntent for promoting a draft (new sale) or existing sale.
 * Returns clientSecret for Stripe Elements integration.
 * Fully gated by PAYMENTS_ENABLED and PROMOTIONS_ENABLED flags.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAdminDb, getRlsDb, fromBase } from '@/lib/supabase/clients'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { assertAccountNotLocked } from '@/lib/auth/accountLock'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { getStripeClient, isPaymentsEnabled, isPromotionsEnabled, getFeaturedWeekPriceId, getFeaturedWeekAmountCents } from '@/lib/stripe/client'
import { computePublishability, type DraftRecord } from '@/lib/drafts/computePublishability'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'

const intentRequestSchema = z.object({
  mode: z.enum(['draft', 'sale']),
  tier: z.enum(['featured_week']).default('featured_week'),
  draft_key: z.string().optional(),
  sale_id: z.string().uuid().optional(),
  promotion_id: z.string().uuid().optional(),
}).refine(
  (data) => {
    if (data.mode === 'draft') {
      return !!data.draft_key
    } else {
      return !!data.sale_id
    }
  },
  {
    message: 'draft_key is required for mode=draft, sale_id is required for mode=sale',
  }
)

export const dynamic = 'force-dynamic'

async function intentHandler(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = await checkCsrfIfRequired(request)
    if (csrfError) {
      return csrfError
    }

    // Auth required
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return fail(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    // Account lock check
    try {
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }

    // Safety gate: Payments must be enabled
    if (!isPaymentsEnabled()) {
      return fail(403, 'PAYMENTS_DISABLED', 'Payments are currently disabled', {
        message: 'Promoted listings are not available at this time. Please check back later.',
      })
    }

    // Safety gate: Promotions must be enabled
    if (!isPromotionsEnabled()) {
      return fail(403, 'PROMOTIONS_DISABLED', 'Promotions are currently disabled', {
        message: 'Promoted listings are not available at this time. Please check back later.',
      })
    }

    // Parse and validate request body
    let body: z.infer<typeof intentRequestSchema>
    try {
      const rawBody = await request.json()
      body = intentRequestSchema.parse(rawBody)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return fail(400, 'VALIDATION_ERROR', 'Invalid request data', error)
      }
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }

    const { mode, tier, draft_key, sale_id, promotion_id } = body

    // Get Stripe client
    const stripe = getStripeClient()
    if (!stripe) {
      logger.error('Stripe client not available', new Error('Stripe client initialization failed'), {
        component: 'promotions/intent',
        operation: 'create_intent',
        mode,
        user_id: user.id.substring(0, 8) + '...',
      })
      return fail(500, 'STRIPE_ERROR', 'Payment processing is temporarily unavailable')
    }

    // Get amount in cents
    let amountCents = 0
    const priceId = getFeaturedWeekPriceId()
    
    if (priceId) {
      // Try to retrieve amount from Stripe price
      try {
        const price = await stripe.prices.retrieve(priceId)
        amountCents = price.unit_amount || 0
      } catch (error) {
        const stripeError = error instanceof Error ? error : new Error(String(error))
        logger.error('Failed to retrieve Stripe price', stripeError, {
          component: 'promotions/intent',
          operation: 'retrieve_price',
          price_id: priceId,
        })
        // Fall back to hardcoded amount
        amountCents = getFeaturedWeekAmountCents()
      }
    } else {
      // No price ID configured - use fallback
      amountCents = getFeaturedWeekAmountCents()
    }

    if (amountCents <= 0) {
      logger.error('Invalid promotion amount', new Error('AMOUNT_INVALID'), {
        component: 'promotions/intent',
        operation: 'create_intent',
        amount_cents: amountCents,
        price_id: priceId,
      })
      return fail(500, 'CONFIG_ERROR', 'Promotion pricing is not configured')
    }

    const admin = getAdminDb()
    const metadata: Record<string, string> = {
      owner_profile_id: user.id,
      tier,
      mode,
    }

    // Handle draft mode
    if (mode === 'draft' && draft_key) {
      // Fetch draft and validate ownership
      const rls = await getRlsDb()
      const { data: draft, error: draftError } = await fromBase(rls, 'sale_drafts')
        .select('*')
        .eq('draft_key', draft_key)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (draftError || !draft) {
        return fail(404, 'DRAFT_NOT_FOUND', 'Draft not found or you do not have access to it')
      }

      // Validate payload
      const { SaleDraftPayloadSchema } = await import('@/lib/validation/saleDraft')
      const validationResult = SaleDraftPayloadSchema.safeParse(draft.payload)
      if (!validationResult.success) {
        return fail(400, 'INVALID_DRAFT', 'Draft payload is invalid')
      }

      // Compute publishability
      const publishability = computePublishability({
        id: draft.id,
        draft_key: draft.draft_key,
        user_id: draft.user_id,
        payload: validationResult.data,
        updated_at: draft.updated_at,
      } as DraftRecord)

      if (!publishability.isPublishable) {
        return fail(400, 'NOT_PUBLISHABLE', 'Draft is not ready to publish', {
          blockingErrors: publishability.blockingErrors,
        })
      }

      // Add draft metadata
      metadata.draft_key = draft_key
      metadata.wants_promotion = 'true'
    }

    // Handle sale mode
    if (mode === 'sale' && sale_id) {
      // Verify sale exists and belongs to user
      const { data: sale, error: saleError } = await fromBase(admin, 'sales')
        .select('id, owner_id, status, archived_at, moderation_status')
        .eq('id', sale_id)
        .single()

      if (saleError || !sale) {
        return fail(404, 'SALE_NOT_FOUND', 'Sale not found')
      }

      // Verify ownership
      if (sale.owner_id !== user.id) {
        return fail(403, 'NOT_OWNER', 'You can only promote your own sales')
      }

      // Verify sale is eligible (published/active, not archived, not hidden)
      if (sale.status !== 'published' && sale.status !== 'active') {
        return fail(400, 'SALE_NOT_ELIGIBLE', 'Sale must be published or active to promote')
      }

      if (sale.archived_at) {
        return fail(400, 'SALE_NOT_ELIGIBLE', 'Archived sales cannot be promoted')
      }

      if (sale.moderation_status === 'hidden_by_admin') {
        return fail(400, 'SALE_NOT_ELIGIBLE', 'Hidden sales cannot be promoted')
      }

      // Ensure promotion record exists (create if not provided)
      let finalPromotionId = promotion_id

      if (!finalPromotionId) {
        // Create pending promotion record
        const startDate = new Date()
        startDate.setUTCHours(0, 0, 0, 0)
        const endDate = new Date(startDate)
        endDate.setUTCDate(endDate.getUTCDate() + 7) // 7 days duration

        const { data: newPromotion, error: promotionError } = await fromBase(admin, 'promotions')
          .insert({
            sale_id,
            owner_profile_id: user.id,
            status: 'pending',
            tier,
            starts_at: startDate.toISOString(),
            ends_at: endDate.toISOString(),
            amount_cents: amountCents,
            currency: 'usd',
          })
          .select('id')
          .single()

        if (promotionError || !newPromotion) {
          logger.error('Failed to create promotion record', promotionError instanceof Error ? promotionError : new Error(String(promotionError)), {
            component: 'promotions/intent',
            operation: 'create_promotion',
            sale_id,
            user_id: user.id.substring(0, 8) + '...',
          })
          return fail(500, 'DATABASE_ERROR', 'Failed to create promotion record')
        }

        finalPromotionId = newPromotion.id
      } else {
        // Verify promotion exists and belongs to user
        const { data: existingPromotion, error: promotionError } = await fromBase(admin, 'promotions')
          .select('id, sale_id, owner_profile_id, status')
          .eq('id', finalPromotionId)
          .maybeSingle()

        if (promotionError || !existingPromotion) {
          return fail(404, 'PROMOTION_NOT_FOUND', 'Promotion not found')
        }

        if (existingPromotion.owner_profile_id !== user.id) {
          return fail(403, 'NOT_OWNER', 'You do not own this promotion')
        }

        if (existingPromotion.sale_id !== sale_id) {
          return fail(400, 'INVALID_PROMOTION', 'Promotion does not match the provided sale')
        }

        // Only allow pending promotions to create payment intents
        if (existingPromotion.status !== 'pending') {
          return fail(400, 'PROMOTION_NOT_PENDING', 'Promotion is not in pending status')
        }
      }

      // TypeScript guard: finalPromotionId must be defined at this point
      if (!finalPromotionId) {
        return fail(500, 'INTERNAL_ERROR', 'Promotion ID is missing')
      }

      // Add sale metadata
      metadata.promotion_id = finalPromotionId
      metadata.sale_id = sale_id
    }

    // Create PaymentIntent
    let paymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        metadata,
      })
    } catch (error) {
      const stripeError = error instanceof Error ? error : new Error(String(error))
      logger.error('Failed to create PaymentIntent', stripeError, {
        component: 'promotions/intent',
        operation: 'create_payment_intent',
        mode,
        amount_cents: amountCents,
        user_id: user.id.substring(0, 8) + '...',
      })
      return fail(500, 'STRIPE_ERROR', 'Failed to create payment intent')
    }

    if (!paymentIntent.client_secret) {
      logger.error('PaymentIntent created but client_secret is missing', new Error('CLIENT_SECRET_MISSING'), {
        component: 'promotions/intent',
        operation: 'create_payment_intent',
        payment_intent_id: paymentIntent.id,
      })
      return fail(500, 'STRIPE_ERROR', 'Payment intent is missing client secret')
    }

    logger.info('PaymentIntent created for promotion', {
      component: 'promotions/intent',
      operation: 'create_payment_intent',
      payment_intent_id: paymentIntent.id,
      mode,
      amount_cents: amountCents,
      user_id: user.id.substring(0, 8) + '...',
    })

    return ok({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error) {
    // Top-level error handler for any unhandled exceptions
    const unexpectedError = error instanceof Error ? error : new Error(String(error))
    logger.error('Unexpected error in promotions intent', unexpectedError, {
      component: 'promotions/intent',
      operation: 'intent_handler',
      errorMessage: unexpectedError.message,
      errorStack: unexpectedError.stack,
    })

    return fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.')
  }
}

export const POST = withRateLimit(intentHandler, [Policies.MUTATE_MINUTE])
