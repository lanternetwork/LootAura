/**
 * Create Stripe Checkout Session for Promotion
 * POST /api/promotions/checkout
 * 
 * Creates a checkout session for promoting a sale listing.
 * Fully gated by PAYMENTS_ENABLED and PROMOTIONS_ENABLED flags.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { assertAccountNotLocked } from '@/lib/auth/accountLock'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { getStripeClient, isPaymentsEnabled, isPromotionsEnabled, getFeaturedWeekPriceId } from '@/lib/stripe/client'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'

const checkoutRequestSchema = z.object({
  sale_id: z.string().uuid(),
  tier: z.enum(['featured_week']).default('featured_week'),
  start_date: z.string().optional(), // ISO date string, defaults to now
})

export const dynamic = 'force-dynamic'

async function checkoutHandler(request: NextRequest) {
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
  let body: z.infer<typeof checkoutRequestSchema>
  try {
    const rawBody = await request.json()
    body = checkoutRequestSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(400, 'VALIDATION_ERROR', 'Invalid request data', error)
    }
    return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
  }

  const { sale_id, tier, start_date } = body

  // Verify sale exists and belongs to user
  const admin = getAdminDb()
  const { data: sale, error: saleError } = await fromBase(admin, 'sales')
    .select('id, owner_id, status, archived_at, moderation_status')
    .eq('id', sale_id)
    .single()

  if (saleError || !sale) {
    return fail(404, 'SALE_NOT_FOUND', 'Sale not found')
  }

  // Verify ownership
  if (sale.owner_id !== user.id) {
    return fail(403, 'FORBIDDEN', 'You can only promote your own sales')
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

  // Get Stripe client
  const stripe = getStripeClient()
  if (!stripe) {
    logger.error('Stripe client not available', new Error('Stripe client initialization failed'), {
      component: 'promotions/checkout',
      operation: 'create_checkout',
      sale_id,
      user_id: user.id.substring(0, 8) + '...',
    })
    return fail(500, 'STRIPE_ERROR', 'Payment processing is temporarily unavailable')
  }

  // Get price ID
  const priceId = getFeaturedWeekPriceId()
  if (!priceId) {
    logger.error('Stripe price ID not configured', new Error('STRIPE_PRICE_ID_FEATURED_WEEK not set'), {
      component: 'promotions/checkout',
      operation: 'create_checkout',
      sale_id,
    })
    return fail(500, 'CONFIG_ERROR', 'Promotion pricing is not configured')
  }

  // Calculate promotion dates (7 days from start_date or now)
  const startDate = start_date ? new Date(start_date) : new Date()
  startDate.setUTCHours(0, 0, 0, 0) // Start at midnight UTC
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + 7) // 7 days duration

  // Get price amount from Stripe (to store in promotion record)
  let amountCents = 0
  try {
    const price = await stripe.prices.retrieve(priceId)
    amountCents = price.unit_amount || 0
  } catch (error) {
    const stripeError = error instanceof Error ? error : new Error(String(error))
    logger.error('Failed to retrieve Stripe price', stripeError, {
      component: 'promotions/checkout',
      operation: 'retrieve_price',
      price_id: priceId,
    })
    
    // Debug-only: Expose underlying Stripe error for troubleshooting
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROMOTIONS_CHECKOUT] Stripe price retrieval failed:', {
        error: stripeError.message,
        errorStack: stripeError.stack,
        priceId,
        saleId: sale_id,
        userId: user.id.substring(0, 8) + '...',
      })
    }
    
    return fail(500, 'STRIPE_ERROR', 'Failed to retrieve promotion pricing')
  }

  // Create promotion record in 'pending' status
  const { data: promotion, error: promotionError } = await fromBase(admin, 'promotions')
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
    .select()
    .single()

  if (promotionError || !promotion) {
    logger.error('Failed to create promotion record', promotionError instanceof Error ? promotionError : new Error(String(promotionError)), {
      component: 'promotions/checkout',
      operation: 'create_promotion',
      sale_id,
      user_id: user.id.substring(0, 8) + '...',
    })
    return fail(500, 'DATABASE_ERROR', 'Failed to create promotion record')
  }

  // Get site URL for redirects (aligned with /api/drafts/publish validation)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  
  if (!siteUrl) {
    logger.error('Site URL not configured', new Error('SITE_URL_MISSING'), {
      component: 'promotions/checkout',
      operation: 'create_checkout',
      sale_id,
      hasNextPublicSiteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
      hasVercelUrl: !!process.env.VERCEL_URL,
    })
    return fail(500, 'SITE_URL_MISSING', 'Site URL is not configured')
  }

  // Create Stripe Checkout Session
  let checkoutSession
  try {
    checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/sales/${sale_id}?promotion=success`,
      cancel_url: `${siteUrl}/sales/${sale_id}?promotion=canceled`,
      metadata: {
        promotion_id: promotion.id,
        sale_id,
        owner_profile_id: user.id,
        tier,
      },
      customer_email: user.email || undefined,
    })
  } catch (error) {
    const stripeError = error instanceof Error ? error : new Error(String(error))
    logger.error('Failed to create Stripe checkout session', stripeError, {
      component: 'promotions/checkout',
      operation: 'create_checkout_session',
      promotion_id: promotion.id,
      sale_id,
      price_id: priceId,
      site_url: siteUrl,
    })
    
    // Debug-only: Expose underlying Stripe error for troubleshooting
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROMOTIONS_CHECKOUT] Stripe checkout session creation failed:', {
        error: stripeError.message,
        errorStack: stripeError.stack,
        priceId,
        siteUrl,
        promotionId: promotion.id,
        saleId: sale_id,
        userId: user.id.substring(0, 8) + '...',
      })
    }
    
    // Clean up promotion record
    await fromBase(admin, 'promotions')
      .update({ status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('id', promotion.id)
    return fail(500, 'STRIPE_ERROR', 'Failed to create checkout session')
  }

  // Update promotion with checkout session ID
  const { error: updateError } = await fromBase(admin, 'promotions')
    .update({
      stripe_checkout_session_id: checkoutSession.id,
      stripe_customer_id: checkoutSession.customer as string | null,
    })
    .eq('id', promotion.id)

  if (updateError) {
    logger.error('Failed to update promotion with checkout session ID', updateError instanceof Error ? updateError : new Error(String(updateError)), {
      component: 'promotions/checkout',
      operation: 'update_promotion',
      promotion_id: promotion.id,
      checkout_session_id: checkoutSession.id,
    })
    // Don't fail - checkout session is created, we can update later via webhook
  }

  logger.info('Checkout session created', {
    component: 'promotions/checkout',
    operation: 'create_checkout',
    promotion_id: promotion.id,
    sale_id,
    checkout_session_id: checkoutSession.id,
    user_id: user.id.substring(0, 8) + '...',
  })

  return ok({
    checkoutUrl: checkoutSession.url,
    sessionId: checkoutSession.id,
    promotionId: promotion.id,
  })
}

export const POST = withRateLimit(checkoutHandler, [Policies.MUTATE_MINUTE])

