/**
 * Get Promotion Price
 * GET /api/promotions/price
 * GET /api/promotions/amount
 * 
 * Returns the current price for featured week promotion.
 * Public endpoint (no auth required) - used for display purposes.
 */

import { NextRequest } from 'next/server'
import { getStripeClient, getFeaturedWeekPriceId, isPaymentsEnabled, isPromotionsEnabled } from '@/lib/stripe/client'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Check if promotions are enabled
  if (!isPromotionsEnabled() || !isPaymentsEnabled()) {
    return fail(403, 'PROMOTIONS_DISABLED', 'Promotions are currently disabled')
  }

  // Parse tier query parameter (future-proof)
  const { searchParams } = new URL(request.url)
  const tier = searchParams.get('tier') || 'featured_week'

  // Currently only featured_week is supported
  if (tier !== 'featured_week') {
    return fail(400, 'INVALID_TIER', 'Invalid promotion tier')
  }

  const stripe = getStripeClient()
  if (!stripe) {
    return fail(500, 'STRIPE_ERROR', 'Payment processing is temporarily unavailable')
  }

  const priceId = getFeaturedWeekPriceId()
  let amountCents = 0
  let currency = 'usd'

  if (priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId)
      amountCents = price.unit_amount || 0
      currency = price.currency || 'usd'
    } catch (error) {
      logger.error('Failed to retrieve Stripe price', error instanceof Error ? error : new Error(String(error)), {
        component: 'promotions/price',
        operation: 'retrieve_price',
        price_id: priceId,
      })
      // Fall back to hardcoded amount
      const { getFeaturedWeekAmountCents } = await import('@/lib/stripe/client')
      amountCents = getFeaturedWeekAmountCents()
    }
  } else {
    // No price ID configured - use fallback
    const { getFeaturedWeekAmountCents } = await import('@/lib/stripe/client')
    amountCents = getFeaturedWeekAmountCents()
  }

  if (amountCents <= 0) {
    return fail(500, 'CONFIG_ERROR', 'Promotion pricing is not configured')
  }

  const amountDollars = (amountCents / 100).toFixed(2)
  
  return ok({
    amountCents,
    amountDollars,
    currency,
    formatted: `$${amountDollars}`,
    tier,
  })
}

