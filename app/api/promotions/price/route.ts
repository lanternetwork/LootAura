/**
 * Get Promotion Price
 * GET /api/promotions/price
 * 
 * Returns the current price for featured week promotion.
 * Public endpoint (no auth required) - used for display purposes.
 */

import { NextRequest } from 'next/server'
import { getStripeClient, getFeaturedWeekPriceId, isPaymentsEnabled, isPromotionsEnabled } from '@/lib/stripe/client'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  // Check if promotions are enabled
  if (!isPromotionsEnabled() || !isPaymentsEnabled()) {
    return fail(403, 'PROMOTIONS_DISABLED', 'Promotions are currently disabled')
  }

  const stripe = getStripeClient()
  if (!stripe) {
    return fail(500, 'STRIPE_ERROR', 'Payment processing is temporarily unavailable')
  }

  const priceId = getFeaturedWeekPriceId()
  if (!priceId) {
    return fail(500, 'CONFIG_ERROR', 'Promotion pricing is not configured')
  }

  try {
    const price = await stripe.prices.retrieve(priceId)
    const amountCents = price.unit_amount || 0
    const amountDollars = (amountCents / 100).toFixed(2)
    
    return ok({
      amountCents,
      amountDollars,
      currency: price.currency || 'usd',
      formatted: `$${amountDollars}`,
    })
  } catch (error) {
    logger.error('Failed to retrieve Stripe price', error instanceof Error ? error : new Error(String(error)), {
      component: 'promotions/price',
      operation: 'retrieve_price',
      price_id: priceId,
    })
    return fail(500, 'STRIPE_ERROR', 'Failed to retrieve promotion pricing')
  }
}

